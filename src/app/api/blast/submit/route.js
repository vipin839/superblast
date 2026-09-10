import { NextResponse } from 'next/server';
import { submitNativeBlast, BlastParameterError } from '@/lib/nativeBlast';
import { startPeriodicCleanup } from '@/lib/cleanupTemp';
import { checkDatabaseStatus, isSelectable, listSelectableDatabases } from '@/lib/dbManager';
import { putResult, putError } from '@/lib/resultStore';
import { handle, requireAuth, rateLimit, acquireSlot, releaseSlot, ApiError } from '@/lib/apiAuth';
import { newRid } from '@/lib/ids';

// Periodic sweep of the container's scratch directory.
startPeriodicCleanup();

// ── Submission limits ──────────────────────────────────────────────────
const MAX_FILES = 100;
const MAX_SINGLE_SEQUENCE_SIZE = 10 * 1024 * 1024;  // 10 MB per file
const MAX_TOTAL_PAYLOAD = 50 * 1024 * 1024;         // 50 MB per submission
const MAX_SEQUENCE_LENGTH = 5_000_000;              // 5 Mbase per file
const CONCURRENCY_LIMIT = 4;                        // BLAST processes at once

/** Bounded-concurrency runner that actually waits for every task. */
async function runWithConcurrency(tasks, limit) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      await task();
    }
  });
  await Promise.all(workers);
}

/**
 * POST /api/blast/submit
 *
 * Authenticated. Compute and Gemini spend are no longer reachable by
 * anonymous callers, and each user is bounded by a rate limit and a
 * concurrent-search cap.
 */
export const POST = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'submit');

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON payload');
  }

  const { sequences, config } = body || {};

  if (!Array.isArray(sequences) || sequences.length === 0) {
    throw new ApiError(400, 'No sequences provided', 'Upload at least one FASTA file.');
  }
  if (sequences.length > MAX_FILES) {
    throw new ApiError(400, `Too many files (${sequences.length})`, `Maximum is ${MAX_FILES} per submission.`);
  }

  const totalBytes = sequences.reduce((n, s) => n + (typeof s?.content === 'string' ? s.content.length : 0), 0);
  if (totalBytes > MAX_TOTAL_PAYLOAD) {
    throw new ApiError(413, 'Submission too large',
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds the ${MAX_TOTAL_PAYLOAD / 1024 / 1024} MB limit.`);
  }

  // ── Per-file validation ──────────────────────────────────────────────
  const validSequences = [];
  const validationErrors = [];

  sequences.forEach((seq, i) => {
    const fname = seq?.filename || `file_${i + 1}`;
    const fail = (error) => validationErrors.push({ filenames: [fname], error, status: 'VALIDATION_FAILED' });

    if (!seq?.content || typeof seq.content !== 'string' || !seq.content.trim()) {
      return fail('Empty or missing sequence content');
    }
    if (seq.content.length > MAX_SINGLE_SEQUENCE_SIZE) {
      return fail(`File too large (${(seq.content.length / 1024 / 1024).toFixed(1)} MB). Max 10 MB per file.`);
    }
    if (!seq.content.trim().startsWith('>')) {
      return fail('Invalid FASTA: the file must start with a ">" header line');
    }

    const residues = seq.content.split('\n').filter((l) => !l.startsWith('>')).join('').replace(/\s/g, '');
    if (residues.length === 0) {
      return fail('The file has a header but no sequence data');
    }
    if (residues.length > MAX_SEQUENCE_LENGTH) {
      return fail(`Sequence too long (${residues.length.toLocaleString()} bases). Max ${MAX_SEQUENCE_LENGTH.toLocaleString()}.`);
    }
    // blastn needs nucleotides. Catch a protein FASTA here rather than letting
    // BLAST+ fail several seconds later with an opaque message.
    const nonNucleotide = residues.replace(/[ACGTURYKMSWBDHVN]/gi, '').length;
    if (nonNucleotide / residues.length > 0.1) {
      return fail('This looks like a protein sequence. This deployment runs nucleotide (blastn) searches only.');
    }

    validSequences.push(seq);
  });

  if (validSequences.length === 0) {
    return NextResponse.json(
      { success: false, jobs: [], errors: validationErrors, estimatedTime: 0 },
      { status: 400 }
    );
  }

  // ── Database selection ───────────────────────────────────────────────
  const selectedDb = config?.database || 'drosophila';
  if (!isSelectable(selectedDb)) {
    const available = listSelectableDatabases().map((d) => d.name).join(', ');
    throw new ApiError(400, `Database "${selectedDb}" is not available`, `Available databases: ${available}.`);
  }

  const dbStatus = await checkDatabaseStatus(selectedDb);
  if (!dbStatus.available) {
    throw new ApiError(503, `Database "${dbStatus.label}" is not ready`,
      dbStatus.error || 'The reference database is missing or incompletely indexed on this server.');
  }

  // ── Dispatch ─────────────────────────────────────────────────────────
  // One RID per file, generated here and used everywhere: temp filenames,
  // the stored result object, and the value returned to the client.
  const jobs = validSequences.map((seq) => ({ ...seq, rid: newRid() }));

  acquireSlot(uid);

  const tasks = jobs.map((seq) => async () => {
    try {
      const result = await submitNativeBlast(seq.content, { ...config, rid: seq.rid });
      await putResult(uid, seq.rid, result.data);
    } catch (err) {
      const message = err instanceof BlastParameterError
        ? err.message
        : (err?.message || 'The search failed.');
      console.error(`BLAST task ${seq.rid} failed:`, message);
      await putError(uid, seq.rid, message).catch((e) =>
        console.error(`Could not record failure for ${seq.rid}:`, e.message));
    }
  });

  // Deliberately not awaited: the client polls for status. The slot is
  // released when the whole batch settles, success or failure.
  runWithConcurrency(tasks, CONCURRENCY_LIMIT)
    .catch((err) => console.error('Batch execution error:', err))
    .finally(() => releaseSlot(uid));

  return NextResponse.json({
    success: true,
    jobs: jobs.map((seq) => ({
      filenames: [seq.filename],
      rid: seq.rid,
      rtoe: 5,
      status: 'PROCESSING',
      submittedAt: new Date().toISOString(),
    })),
    errors: validationErrors,
    estimatedTime: 10,
  });
});

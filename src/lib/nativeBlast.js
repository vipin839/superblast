import { execFile, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { ensureDatabase, getDatabasePath, DB_TIMEOUTS } from './dbManager';
import { cleanupFiles, getTempDir } from './cleanupTemp';
import { isValidRid, newRid } from './ids';

/**
 * Native NCBI BLAST+ execution.
 *
 * Two things changed from the original implementation and both matter:
 *
 * 1. `spawn` with an argument array replaces `exec` with a concatenated
 *    command string. There is no shell, so no amount of crafted input can
 *    introduce a second command, a redirect, or a glob.
 *
 * 2. The caller supplies the RID. Previously the submit route generated one
 *    RID for the result filename and this module generated a *different* one
 *    for its temp files, so the two never referred to the same search.
 */

const MAX_BUFFER = 100 * 1024 * 1024; // 100 MB of BLAST JSON

const VALID_TASKS = ['megablast', 'dc-megablast', 'blastn'];
const VALID_PROGRAMS = ['blastn'];

/**
 * Live child processes, keyed by RID, so a cancel request can actually kill
 * the blastn process rather than only flipping a flag in Firestore.
 *
 * LIMITATION: this registry is instance-local. A cancel request routed to a
 * different Cloud Run instance cannot reach the process. `cancelBlast()`
 * reports honestly which of the two happened; see docs/ARCHITECTURE.md.
 */
const running = new Map();

export function isRunningHere(rid) {
  return running.has(rid);
}

/**
 * Kill a locally running BLAST process.
 * @returns {'killed'|'not-here'} what actually happened — never a false claim.
 */
export function cancelBlast(rid) {
  const child = running.get(rid);
  if (!child) return 'not-here';
  try {
    child.kill('SIGTERM');
    // Escalate if it ignores the polite signal.
    setTimeout(() => {
      if (running.has(rid)) {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }
    }, 5000).unref?.();
  } catch {
    return 'not-here';
  }
  return 'killed';
}

function validateParams({ program, task, evalue, maxTargetSeqs, wordSize }) {
  const errors = [];

  const safeProgram = VALID_PROGRAMS.includes(program) ? program : 'blastn';
  if (program && !VALID_PROGRAMS.includes(program)) {
    errors.push(`Program "${program}" is not supported. This deployment runs nucleotide searches (blastn) only.`);
  }

  const safeTask = VALID_TASKS.includes(task) ? task : 'megablast';
  if (task && !VALID_TASKS.includes(task)) {
    errors.push(`Task "${task}" is not valid for blastn. Choose one of: ${VALID_TASKS.join(', ')}.`);
  }

  const ev = Number(evalue);
  if (evalue !== undefined && (!Number.isFinite(ev) || ev <= 0 || ev > 1000)) {
    errors.push('E-value must be a positive number no greater than 1000.');
  }
  const safeEvalue = Number.isFinite(ev) && ev > 0 && ev <= 1000 ? String(ev) : '0.01';

  const mts = parseInt(maxTargetSeqs, 10);
  if (maxTargetSeqs !== undefined && (!Number.isInteger(mts) || mts < 1 || mts > 5000)) {
    errors.push('Max target sequences must be a whole number between 1 and 5000.');
  }
  const safeMaxTargets = Number.isInteger(mts) && mts >= 1 && mts <= 5000 ? String(mts) : '50';

  // Word size has task-specific minimums in BLAST+; reject rather than let
  // blastn fail with a cryptic message.
  let safeWordSize = null;
  if (wordSize !== undefined && wordSize !== null && wordSize !== '') {
    const ws = parseInt(wordSize, 10);
    const min = safeTask === 'blastn' ? 4 : safeTask === 'dc-megablast' ? 11 : 16;
    if (!Number.isInteger(ws) || ws < min || ws > 64) {
      errors.push(`Word size for ${safeTask} must be between ${min} and 64.`);
    } else {
      safeWordSize = String(ws);
    }
  }

  return { errors, safeProgram, safeTask, safeEvalue, safeMaxTargets, safeWordSize };
}

export class BlastParameterError extends Error {}

/**
 * Run one BLAST search to completion.
 *
 * @param {string} query   FASTA text
 * @param {object} options { rid, program, database, evalue, maxTargetSeqs, task, wordSize }
 * @returns {Promise<{rid:string, data:object}>}
 */
export async function submitNativeBlast(query, options = {}) {
  const { database = 'drosophila' } = options;

  // The caller owns the RID. Generating one here would desynchronise the
  // temp files from the result the API later looks for.
  const rid = isValidRid(options.rid) ? options.rid : newRid();

  const { errors, safeProgram, safeTask, safeEvalue, safeMaxTargets, safeWordSize } =
    validateParams(options);
  if (errors.length) throw new BlastParameterError(errors.join(' '));

  const safeDatabase = String(database).replace(/[^a-zA-Z0-9_-]/g, '');

  const tempDir = getTempDir();
  const queryFile = path.join(tempDir, `query_${rid}.fasta`);
  const outFile = path.join(tempDir, `out_${rid}.json`);

  // Throws with a clear message if the database is missing or not indexed.
  await ensureDatabase(safeDatabase);
  const dbPath = getDatabasePath(safeDatabase);
  const timeout = DB_TIMEOUTS[safeDatabase] || 300_000;
  const numThreads = '2';

  const args = [
    '-task', safeTask,
    '-query', queryFile,
    '-db', dbPath,
    '-out', outFile,
    '-outfmt', '15',
    '-evalue', safeEvalue,
    '-max_target_seqs', safeMaxTargets,
    '-num_threads', numThreads,
  ];
  if (safeWordSize) args.push('-word_size', safeWordSize);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(queryFile, query, 'utf8');

    await runBlast(safeProgram, args, { rid, timeout });

    const resultText = await fs.readFile(outFile, 'utf8');
    const data = JSON.parse(resultText);
    const parsedData = parseBlastJSON(data);

    await cleanupFiles(queryFile, outFile);
    return { rid, rtoe: 0, data: parsedData };
  } catch (error) {
    await cleanupFiles(queryFile, outFile);
    throw translateBlastError(error, safeDatabase, timeout);
  }
}

/** spawn + register + collect, so the process can be cancelled while it runs. */
function runBlast(bin, args, { rid, timeout }) {
  return new Promise((resolve, reject) => {
    const blastDbDir = process.env.BLASTDB || (process.env.NODE_ENV === 'production' ? '/app/blastdb' : './blastdb');
    const child = spawn(bin, args, {
      env: { ...process.env, BLASTDB: blastDbDir },
      shell: false,
    });

    running.set(rid, child);

    let stderr = '';
    let stderrLen = 0;
    child.stderr.on('data', (c) => {
      stderrLen += c.length;
      if (stderrLen < 64 * 1024) stderr += c.toString();
    });
    // -out writes to a file, so stdout should be empty; drain it anyway.
    child.stdout.on('data', () => {});

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      running.delete(rid);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      running.delete(rid);
      if (timedOut) {
        const e = new Error('BLAST_TIMEOUT');
        e.timedOut = true;
        return reject(e);
      }
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        const e = new Error('BLAST_CANCELLED');
        e.cancelled = true;
        return reject(e);
      }
      if (code !== 0) {
        const e = new Error(stderr.trim() || `blastn exited with code ${code}`);
        e.exitCode = code;
        return reject(e);
      }
      resolve();
    });
  });
}

function translateBlastError(error, database, timeout) {
  if (error instanceof BlastParameterError) return error;
  if (error?.cancelled) return Object.assign(new Error('Search was cancelled.'), { cancelled: true });
  if (error?.timedOut) {
    return new Error(`Search timed out after ${Math.round(timeout / 1000)}s. Try a shorter sequence or a smaller database.`);
  }
  const msg = error?.message || '';
  if (error?.code === 'ENOENT') {
    return new Error('The BLAST+ executable is not available on this server.');
  }
  if (msg.includes('BLAST Database error') || msg.includes('No alias or index file')) {
    return new Error(`Database "${database}" is not available on this server.`);
  }
  if (msg.includes('ENOMEM') || msg.includes('std::bad_alloc')) {
    return new Error('The server ran out of memory. Try a shorter sequence or fewer files at once.');
  }
  // Truncate so a stack trace or filesystem path never reaches the browser.
  return new Error(`BLAST engine error: ${msg.split('\n')[0].slice(0, 300)}`);
}

/**
 * Count true gap OPENINGS: each maximal run of '-' is one opening, counted on
 * both the query and the subject side.
 *
 * BLAST JSON-15's `hsp.gaps` is the number of gap POSITIONS. The original code
 * reported that value under the name `gapOpens`, which is what the tabular
 * BLAST format calls something different — a 12-base gap was reported as 12
 * gap openings instead of 1. Both numbers are now reported, under names that
 * say what they are.
 */
export function countGapOpens(qseq = '', hseq = '') {
  let opens = 0;
  for (const s of [qseq, hseq]) {
    let inGap = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '-') {
        if (!inGap) { opens++; inGap = true; }
      } else {
        inGap = false;
      }
    }
  }
  return opens;
}

/**
 * Parse NCBI BLAST JSON-15 into the application's hit model.
 */
export function parseBlastJSON(data) {
  const results = { program: '', database: '', queryCount: 0, hits: [], searches: [] };

  const report = data.BlastOutput2 || data;
  const reports = Array.isArray(report) ? report : [report];

  for (const r of reports) {
    const search = r.report?.results?.search || r.results?.search || {};
    const queryTitle = search.query_title || search.query_id || 'Unknown';
    const queryLen = search.query_len || 0;

    results.program = r.report?.program || results.program;
    results.database = r.report?.search_target?.db || results.database;
    results.queryCount++;

    const searchResult = { queryTitle, queryLen, hits: [], message: search.message || null };

    for (const hit of (search.hits || [])) {
      const d = hit.description?.[0] || {};
      for (const hsp of (hit.hsps || [])) {
        const alignLen = hsp.align_len || 0;
        const identityCount = hsp.identity || 0;
        const gapPositions = hsp.gaps || 0;

        const parsedHit = {
          queryTitle,
          queryLen,
          subjectAcc: d.accession || 'N/A',
          subjectId: d.id || 'N/A',
          subjectTitle: d.title || 'No title',
          subjectSciName: d.sciname || 'Unknown',
          subjectTaxId: d.taxid || 0,
          subjectLen: hit.len || 0,

          identity: alignLen > 0 ? Math.round((identityCount / alignLen) * 10000) / 100 : 0,
          identityCount,
          alignmentLength: alignLen,
          mismatches: Math.max(0, alignLen - identityCount - gapPositions),

          // Both gap measures, each named for what it actually is.
          gapPositions,
          gapOpens: countGapOpens(hsp.qseq || '', hsp.hseq || ''),

          qStart: hsp.query_from || 0,
          qEnd: hsp.query_to || 0,
          sStart: hsp.hit_from || 0,
          sEnd: hsp.hit_to || 0,
          evalue: hsp.evalue ?? 999,
          bitScore: hsp.bit_score || 0,
          score: hsp.score || 0,
          qseq: hsp.qseq || '',
          hseq: hsp.hseq || '',
          midline: hsp.midline || '',
          queryStrand: hsp.query_strand || 'Plus',
          hitStrand: hsp.hit_strand || 'Plus',
        };

        parsedHit.queryCoverage = queryLen > 0
          ? Math.round(((Math.abs(hsp.query_to - hsp.query_from) + 1) / queryLen) * 10000) / 100
          : 0;

        searchResult.hits.push(parsedHit);
        results.hits.push(parsedHit);
      }
    }

    searchResult.hits.sort((a, b) => a.evalue - b.evalue);
    results.searches.push(searchResult);
  }

  return results;
}

export { MAX_BUFFER, execFile };

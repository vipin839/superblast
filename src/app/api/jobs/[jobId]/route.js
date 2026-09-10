import { NextResponse } from 'next/server';
import { getJobById, updateJobById, deleteJobById } from '@/lib/firestoreJobs';
import { handle, requireAuth, rateLimit, assertOwner, ApiError } from '@/lib/apiAuth';

/**
 * Every handler here follows the same sequence:
 *   verify token -> load job -> assert the token's uid owns it -> act.
 *
 * A job that exists but belongs to someone else returns 404, identical to a
 * job that does not exist, so responses cannot be used to enumerate IDs.
 */

/** Fields a client is allowed to change on its own job. */
const MUTABLE_FIELDS = new Set([
  'status', 'progress', 'completedAt', 'terminatedAt', 'error',
  'results', 'hitCount', 'aiAnalysis', 'aiSource', 'aiGeneratedAt', 'notes',
]);

async function loadOwned(jobId, uid) {
  if (!jobId || typeof jobId !== 'string' || jobId.length > 128) {
    throw new ApiError(400, 'Invalid job id');
  }
  const job = await getJobById(jobId);
  return assertOwner(job, uid);
}

export const GET = handle(async (request, { params }) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');
  const { jobId } = await params;
  const job = await loadOwned(jobId, uid);
  return NextResponse.json(job);
});

export const PATCH = handle(async (request, { params }) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');
  const { jobId } = await params;
  await loadOwned(jobId, uid);

  let updates;
  try {
    updates = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON payload');
  }
  if (!updates || typeof updates !== 'object') throw new ApiError(400, 'No updates supplied');

  // Never let a PATCH rewrite ownership or identity.
  const safe = {};
  for (const [k, v] of Object.entries(updates)) {
    if (MUTABLE_FIELDS.has(k)) safe[k] = v;
  }
  if (Object.keys(safe).length === 0) {
    throw new ApiError(400, 'No updatable fields supplied');
  }

  const ok = await updateJobById(jobId, safe);
  if (!ok) throw new ApiError(404, 'Search not found');
  return NextResponse.json({ success: true });
});

export const DELETE = handle(async (request, { params }) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');
  const { jobId } = await params;
  await loadOwned(jobId, uid);

  const ok = await deleteJobById(jobId);
  if (!ok) throw new ApiError(404, 'Search not found');
  return NextResponse.json({ success: true });
});

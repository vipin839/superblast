import { NextResponse } from 'next/server';
import { getUserJobs, saveJob } from '@/lib/firestoreJobs';
import { handle, requireAuth, rateLimit, ApiError } from '@/lib/apiAuth';
import { newJobId, isValidJobId } from '@/lib/ids';

/**
 * GET /api/jobs
 *
 * Lists the authenticated caller's jobs. There is deliberately no `uid`
 * parameter: the owner is whoever the verified ID token says it is.
 */
export const GET = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  const jobs = await getUserJobs(uid);
  return NextResponse.json({ jobs });
});

/**
 * POST /api/jobs
 *
 * Creates a job owned by the caller. The server assigns the owner and
 * validates the id; both were previously taken from the request body.
 */
export const POST = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON payload');
  }

  const jobData = body?.jobData;
  if (!jobData || typeof jobData !== 'object') {
    throw new ApiError(400, 'jobData is required');
  }

  // Accept a client-proposed id only when it is one of our own unguessable
  // ids (so the submit flow can reuse the id it already showed the user);
  // otherwise mint a fresh one server-side.
  const id = isValidJobId(jobData.id) ? jobData.id : newJobId();

  // Drop any client attempt to set ownership.
  const { uid: _uid, ownerUid: _ownerUid, ...safe } = jobData;

  await saveJob(uid, { ...safe, id });
  return NextResponse.json({ success: true, jobId: id });
});

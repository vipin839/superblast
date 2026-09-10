import { NextResponse } from 'next/server';
import { cancelBlast, isRunningHere } from '@/lib/nativeBlast';
import { putError } from '@/lib/resultStore';
import { handle, requireAuth, rateLimit, parseRids } from '@/lib/apiAuth';

/**
 * POST /api/blast/cancel   { rids: "a1b2...,c3d4..." }
 *
 * Real cancellation, with an honest report of what happened.
 *
 * The process registry lives in one Cloud Run instance's memory. If this
 * request lands on the instance that is running the search, the blastn
 * process is signalled and genuinely dies. If it lands elsewhere, we mark the
 * search cancelled in shared storage so the UI stops polling — but we say so
 * in the response rather than claiming a kill that did not happen. The orphan
 * process still exits on its own timeout (see DB_TIMEOUTS).
 */
export const POST = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const rids = parseRids(body?.rids);

  const outcome = { killed: [], markedOnly: [] };

  for (const rid of rids) {
    const here = isRunningHere(rid);
    const res = cancelBlast(rid);
    // Record the terminal state either way so status polling settles.
    await putError(uid, rid, 'Search cancelled by the user.').catch(() => {});
    if (here && res === 'killed') outcome.killed.push(rid);
    else outcome.markedOnly.push(rid);
  }

  return NextResponse.json({
    success: true,
    ...outcome,
    note: outcome.markedOnly.length
      ? 'Some searches were running on a different server instance. They are marked cancelled and will stop at their timeout; the process could not be signalled directly.'
      : undefined,
  });
});

import { NextResponse } from 'next/server';
import { getResult } from '@/lib/resultStore';
import { handle, requireAuth, rateLimit, parseRids, assertRid, ApiError } from '@/lib/apiAuth';

/**
 * GET /api/blast/results?rid=<16 hex>  or  ?rids=<comma separated>
 *
 * Results are namespaced by the authenticated uid in shared storage, so a
 * leaked rid alone does not grant access to another user's results.
 */
export const GET = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  const { searchParams } = new URL(request.url);
  const single = searchParams.get('rid');
  const multi = searchParams.get('rids');

  if (multi) {
    const rids = parseRids(multi);
    const results = {};
    await Promise.all(rids.map(async (rid) => {
      const r = await getResult(uid, rid);
      if (r) results[rid] = r;
    }));
    return NextResponse.json({ results });
  }

  if (!single) {
    return NextResponse.json({ error: 'rid or rids is required' }, { status: 400 });
  }

  const result = await getResult(uid, assertRid(single));
  if (!result) throw new ApiError(404, 'Results not found', 'The search may still be running, or its results have expired.');
  return NextResponse.json(result);
});

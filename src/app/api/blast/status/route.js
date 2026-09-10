import { NextResponse } from 'next/server';
import { statusOf } from '@/lib/resultStore';
import { handle, requireAuth, rateLimit, parseRids, assertRid } from '@/lib/apiAuth';

/**
 * GET /api/blast/status?rid=<16 hex>  or  ?rids=<comma separated>
 *
 * Two changes from the original: the caller must be authenticated, and the
 * rid is allowlisted against /^[a-f0-9]{16}$/ before it is used to build any
 * storage path. Status is read from shared storage, so any Cloud Run instance
 * returns the same answer regardless of which one ran the search.
 */
export const GET = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  const { searchParams } = new URL(request.url);
  const single = searchParams.get('rid');
  const multi = searchParams.get('rids');

  if (multi) {
    const rids = parseRids(multi);
    const statuses = {};
    await Promise.all(rids.map(async (rid) => { statuses[rid] = await statusOf(uid, rid); }));
    return NextResponse.json({ statuses });
  }

  if (!single) {
    return NextResponse.json({ error: 'rid or rids is required' }, { status: 400 });
  }

  return NextResponse.json(await statusOf(uid, assertRid(single)));
});

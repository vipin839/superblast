import { NextResponse } from 'next/server';
import { listDatabases } from '@/lib/dbManager';
import { handle, requireAuth, rateLimit } from '@/lib/apiAuth';

/**
 * GET /api/databases
 *
 * Real availability, so the UI never shows a "Ready" badge for a database
 * that cannot run. `?deep=1` additionally runs `blastdbcmd -info`, which
 * proves the index is readable and reports sequence counts.
 */
export const GET = handle(async (request) => {
  const { uid } = await requireAuth(request);
  rateLimit(uid, 'read');

  const deep = new URL(request.url).searchParams.get('deep') === '1';
  const dbs = await listDatabases({ deep });

  return NextResponse.json({
    databases: Object.values(dbs).map((d) => ({
      name: d.name || null,
      label: d.label,
      organism: d.organism || null,
      source: d.source || null,
      accession: d.accession || null,
      assembly: d.assembly || null,
      moleculeType: d.moleculeType || null,
      state: d.state,
      available: d.available,
      selectable: !!d.selectable,
      reason: d.error || null,
      sequenceCount: d.sequenceCount ?? null,
      totalLetters: d.totalLetters ?? null,
      builtAt: d.builtAt ?? null,
    })),
  });
});

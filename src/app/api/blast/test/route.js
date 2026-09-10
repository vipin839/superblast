import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { listDatabases, getDatabasePath, DB_DIR } from '@/lib/dbManager';
import { handle, requireAuth, ApiError } from '@/lib/apiAuth';

const execFileAsync = promisify(execFile);

/**
 * GET /api/blast/test — engine diagnostics.
 *
 * Previously anonymous, and it returned a raw `ls -la` of the image plus
 * internal paths. It is now admin-only and reports structured facts instead
 * of shell output. Set ADMIN_EMAILS to a comma-separated list to grant access.
 */
function assertAdmin(auth) {
  const allowed = (process.env.ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) {
    throw new ApiError(404, 'Not found');   // endpoint is off unless configured
  }
  if (!auth.email || !allowed.includes(auth.email.toLowerCase())) {
    throw new ApiError(403, 'Administrator access required');
  }
}

export const GET = handle(async (request) => {
  const auth = await requireAuth(request);
  assertAdmin(auth);

  const diagnostics = {
    timestamp: new Date().toISOString(),
    engine: { installed: false, version: null, makeblastdb: null, blastdbcmd: null },
    databases: {},
    scratch: { writable: false },
    testQuery: null,
    errors: [],
  };

  for (const [key, bin] of [['version', 'blastn'], ['makeblastdb', 'makeblastdb'], ['blastdbcmd', 'blastdbcmd']]) {
    try {
      const { stdout } = await execFileAsync(bin, ['-version'], { timeout: 15_000 });
      const line = stdout.trim().split('\n')[0];
      if (key === 'version') { diagnostics.engine.installed = true; diagnostics.engine.version = line; }
      else diagnostics.engine[key] = line;
    } catch (err) {
      diagnostics.errors.push(`${bin} unavailable: ${(err.message || '').split('\n')[0]}`);
    }
  }

  diagnostics.databases = await listDatabases({ deep: true });

  const scratch = process.env.NODE_ENV === 'production' ? '/app/temp_queries' : os.tmpdir();
  try {
    await fs.mkdir(scratch, { recursive: true });
    const probe = path.join(scratch, `probe_${Date.now()}.txt`);
    await fs.writeFile(probe, 'probe');
    await fs.unlink(probe);
    diagnostics.scratch = { writable: true };
  } catch (err) {
    diagnostics.errors.push(`Scratch directory not writable: ${err.message}`);
  }

  // Real end-to-end engine test against a ready database.
  const ready = Object.values(diagnostics.databases).find((d) => d.available);
  if (diagnostics.engine.installed && ready) {
    const qf = path.join(scratch, `diag_${Date.now()}.fasta`);
    const of = path.join(scratch, `diag_${Date.now()}.json`);
    try {
      await fs.writeFile(qf, '>diagnostic\nATGCATGCATGCATGCATGCATGC\n');
      await execFileAsync('blastn', [
        '-task', 'blastn', '-query', qf, '-db', getDatabasePath(ready.name),
        '-out', of, '-outfmt', '15', '-evalue', '10', '-max_target_seqs', '5', '-num_threads', '1',
      ], { timeout: 30_000 });
      const data = JSON.parse(await fs.readFile(of, 'utf8'));
      diagnostics.testQuery = {
        result: 'SUCCESS',
        database: ready.name,
        hits: data.BlastOutput2?.[0]?.report?.results?.search?.hits?.length ?? 0,
        validJson15: !!data.BlastOutput2,
      };
    } catch (err) {
      diagnostics.testQuery = { result: 'FAILED', database: ready.name };
      diagnostics.errors.push(`Test query failed: ${(err.message || '').split('\n')[0].slice(0, 200)}`);
    } finally {
      await fs.unlink(qf).catch(() => {});
      await fs.unlink(of).catch(() => {});
    }
  }

  diagnostics.healthy =
    diagnostics.engine.installed &&
    Object.values(diagnostics.databases).some((d) => d.available) &&
    diagnostics.testQuery?.result === 'SUCCESS';

  return NextResponse.json(diagnostics);
});

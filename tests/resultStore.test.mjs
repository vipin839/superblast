import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Finding 05: results must not depend on which Cloud Run instance ran the
 * search. These tests cover the storage contract and, importantly, that
 * production refuses to fall back to container-local files.
 */

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'blasthub-test-'));
vi.mock('@/lib/cleanupTemp', () => ({ getTempDir: () => scratch, cleanupFiles: async () => {} }));

let store;
beforeEach(async () => {
  vi.resetModules();
  delete process.env.BLAST_RESULTS_BUCKET;
  process.env.NODE_ENV = 'test';
  store = await import('@/lib/resultStore');
});
afterEach(async () => { await fs.rm(scratch, { recursive: true, force: true }).catch(() => {}); await fs.mkdir(scratch, { recursive: true }); });

const UID = 'user-abc';
const RID = '0123456789abcdef';

describe('result store', () => {
  it('round-trips a result', async () => {
    await store.putResult(UID, RID, { hits: [{ subjectAcc: 'NC_045512.2' }] });
    expect(await store.getResult(UID, RID)).toEqual({ hits: [{ subjectAcc: 'NC_045512.2' }] });
  });

  it('reports PROCESSING before anything is written', async () => {
    expect((await store.statusOf(UID, RID)).status).toBe('PROCESSING');
  });

  it('reports READY once a result exists', async () => {
    await store.putResult(UID, RID, { hits: [] });
    expect((await store.statusOf(UID, RID)).status).toBe('READY');
  });

  it('reports FAILED with the real reason, never a fake success', async () => {
    await store.putError(UID, RID, 'Database "ecoli" is not available on this server.');
    const st = await store.statusOf(UID, RID);
    expect(st.status).toBe('FAILED');
    expect(st.message).toContain('not available');
  });

  it('returns null for a result that was never written', async () => {
    expect(await store.getResult(UID, 'fedcba9876543210')).toBeNull();
  });

  it('refuses to build a path from an invalid rid', async () => {
    for (const bad of ['../../etc/passwd', 'x', '', '0123456789ABCDEF']) {
      await expect(store.putResult(UID, bad, {})).rejects.toThrow(/invalid rid/i);
    }
  });

  it('refuses to build a path from an invalid uid', async () => {
    await expect(store.putResult('../../evil', RID, {})).rejects.toThrow(/invalid uid/i);
  });

  it('deletes both the result and the error marker', async () => {
    await store.putResult(UID, RID, { hits: [] });
    await store.putError(UID, RID, 'boom');
    await store.deleteResult(UID, RID);
    expect(await store.getResult(UID, RID)).toBeNull();
    expect(await store.getError(UID, RID)).toBeNull();
  });
});

describe('production refuses instance-local storage (finding 05)', () => {
  it('throws when no bucket is configured in production', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    delete process.env.BLAST_RESULTS_BUCKET;
    const prod = await import('@/lib/resultStore');
    await expect(prod.putResult(UID, RID, {})).rejects.toThrow(/BLAST_RESULTS_BUCKET/);
    process.env.NODE_ENV = 'test';
  });

  it('declares whether storage is shared across instances', async () => {
    expect(store.storageMode().sharedAcrossInstances).toBe(false);
    vi.resetModules();
    process.env.BLAST_RESULTS_BUCKET = 'some-bucket';
    const gcs = await import('@/lib/resultStore');
    expect(gcs.storageMode()).toMatchObject({ mode: 'gcs', sharedAcrossInstances: true });
    delete process.env.BLAST_RESULTS_BUCKET;
  });
});

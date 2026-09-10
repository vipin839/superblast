import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import { getTempDir } from './cleanupTemp';
import { isValidRid } from './ids';

/**
 * Shared, instance-independent storage for BLAST results.
 *
 * The previous design wrote `final_<rid>.json` to the container filesystem.
 * With max-instances 10 the instance that ran the search is usually not the
 * instance that later serves the poll, so results appeared to vanish. Results
 * now live in Google Cloud Storage, which every instance can read.
 *
 * Layout inside the bucket:
 *   results/<uid>/<rid>.json     completed result payload
 *   results/<uid>/<rid>.error    failure marker (JSON: { error })
 *
 * The uid prefix means a caller cannot read another user's object even if the
 * rid leaked, and it gives us a natural per-user lifecycle rule.
 *
 * Local development with no bucket configured falls back to the temp
 * directory. That fallback is single-instance only and is refused in
 * production so a misconfigured deploy fails loudly instead of silently
 * reintroducing the bug it was meant to fix.
 */

const BUCKET = process.env.BLAST_RESULTS_BUCKET || '';
const PREFIX = 'results';
const IS_PROD = process.env.NODE_ENV === 'production';

let storage;
function bucket() {
  if (!BUCKET) return null;
  if (!storage) storage = new Storage();
  return storage.bucket(BUCKET);
}

export function storageMode() {
  if (BUCKET) return { mode: 'gcs', bucket: BUCKET, sharedAcrossInstances: true };
  return { mode: 'local-disk', bucket: null, sharedAcrossInstances: false };
}

/**
 * Guard every path component that comes from a request. Both storage backends
 * go through this, so the local fallback cannot be laxer than GCS.
 */
function safeParts(uid, rid) {
  if (!isValidRid(rid)) throw new Error('Refusing to build a path from an invalid rid');
  if (!uid || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error('Refusing to build a path from an invalid uid');
  }
  return { uid, rid };
}

function objectPath(uid, rid, ext) {
  const p = safeParts(uid, rid);
  return `${PREFIX}/${p.uid}/${p.rid}.${ext}`;
}

function localPath(uid, rid, ext) {
  const p = safeParts(uid, rid);
  const dir = path.join(getTempDir(), PREFIX, p.uid);
  const full = path.join(dir, `${p.rid}.${ext}`);
  // Second defensive layer: the resolved path must still be inside the base.
  const base = path.resolve(getTempDir());
  if (!path.resolve(full).startsWith(base + path.sep)) {
    throw new Error('Path escape detected');
  }
  return full;
}

async function ensureLocalDir(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
}

function assertConfigured() {
  if (IS_PROD && !BUCKET) {
    throw new Error(
      'BLAST_RESULTS_BUCKET is not set. Production requires shared result storage; ' +
      'container-local files are not visible to other Cloud Run instances.'
    );
  }
}

/** Persist a completed result. */
export async function putResult(uid, rid, payload) {
  assertConfigured();
  const body = JSON.stringify(payload);
  const b = bucket();
  if (b) {
    await b.file(objectPath(uid, rid, 'json')).save(body, {
      contentType: 'application/json',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0, no-store' },
    });
    return;
  }
  const file = localPath(uid, rid, 'json');
  await ensureLocalDir(file);
  await fs.writeFile(file, body, 'utf8');
}

/** Persist a failure marker so polling can report the real reason. */
export async function putError(uid, rid, message) {
  assertConfigured();
  const body = JSON.stringify({ error: String(message || 'Unknown error').slice(0, 2000) });
  const b = bucket();
  if (b) {
    await b.file(objectPath(uid, rid, 'error')).save(body, {
      contentType: 'application/json',
      resumable: false,
    });
    return;
  }
  const file = localPath(uid, rid, 'error');
  await ensureLocalDir(file);
  await fs.writeFile(file, body, 'utf8');
}

/** @returns {Promise<object|null>} the stored result, or null if not present. */
export async function getResult(uid, rid) {
  const b = bucket();
  if (b) {
    try {
      const [buf] = await b.file(objectPath(uid, rid, 'json')).download();
      return JSON.parse(buf.toString('utf8'));
    } catch (err) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
  try {
    return JSON.parse(await fs.readFile(localPath(uid, rid, 'json'), 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {Promise<string|null>} the stored error message, or null. */
export async function getError(uid, rid) {
  const b = bucket();
  if (b) {
    try {
      const [buf] = await b.file(objectPath(uid, rid, 'error')).download();
      return JSON.parse(buf.toString('utf8')).error || 'Job failed';
    } catch (err) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
  try {
    return JSON.parse(await fs.readFile(localPath(uid, rid, 'error'), 'utf8')).error || 'Job failed';
  } catch {
    return null;
  }
}

/**
 * Status for one rid, derived purely from shared storage so any instance
 * returns the same answer.
 * @returns {'READY'|'FAILED'|'PROCESSING'} plus a message
 */
export async function statusOf(uid, rid) {
  const err = await getError(uid, rid);
  if (err) return { status: 'FAILED', message: err };

  const b = bucket();
  if (b) {
    const [exists] = await b.file(objectPath(uid, rid, 'json')).exists();
    if (exists) return { status: 'READY', message: 'Search completed.' };
    return { status: 'PROCESSING', message: 'Search is running.' };
  }
  try {
    await fs.access(localPath(uid, rid, 'json'));
    return { status: 'READY', message: 'Search completed.' };
  } catch {
    return { status: 'PROCESSING', message: 'Search is running.' };
  }
}

/** Remove both objects for a rid (used when a user deletes a search). */
export async function deleteResult(uid, rid) {
  const b = bucket();
  if (b) {
    await Promise.all([
      b.file(objectPath(uid, rid, 'json')).delete({ ignoreNotFound: true }),
      b.file(objectPath(uid, rid, 'error')).delete({ ignoreNotFound: true }),
    ]);
    return;
  }
  await Promise.all([
    fs.unlink(localPath(uid, rid, 'json')).catch(() => {}),
    fs.unlink(localPath(uid, rid, 'error')).catch(() => {}),
  ]);
}

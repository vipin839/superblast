import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './firebaseAdmin';

/**
 * Server-side authentication and abuse control for every API route.
 *
 * The rule this module exists to enforce: the server NEVER takes a uid, an
 * owner, or a job claim from the request body or query string. The only
 * trusted source of identity is a Firebase ID token the server has verified
 * itself.
 */

/** Thrown by the helpers below; caught by `handle()` and turned into a response. */
export class ApiError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Map a Firebase Admin error code to the response the client should see.
 * Every branch is a 401: the distinction is only in the message, so the user
 * knows whether to reload or sign in again.
 */
export function authErrorFor(code) {
  if (code === 'auth/id-token-expired') {
    return new ApiError(401, 'Session expired', 'Your sign-in has expired. Reload the page and try again.');
  }
  if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled') {
    return new ApiError(401, 'Session revoked', 'This session is no longer valid. Sign in again.');
  }
  return new ApiError(401, 'Invalid authentication', 'The credential supplied could not be verified.');
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verify the caller's Firebase ID token and return the authenticated identity.
 * Throws 401 when the token is absent, malformed, expired or revoked.
 */
export async function requireAuth(request) {
  const token = bearerToken(request);
  if (!token) {
    throw new ApiError(401, 'Authentication required', 'Send a Firebase ID token as "Authorization: Bearer <token>".');
  }

  let decoded;
  try {
    // checkRevoked:true costs one extra lookup but means a signed-out or
    // disabled account cannot keep using a token until it expires.
    decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
  } catch (err) {
    throw authErrorFor(err?.code);
  }

  if (!decoded?.uid) throw new ApiError(401, 'Invalid authentication');
  return { uid: decoded.uid, email: decoded.email || null, emailVerified: !!decoded.email_verified };
}

/**
 * Ownership gate.
 *
 * A job that exists but belongs to someone else is reported as 404, not 403,
 * so the response cannot be used to probe which job IDs exist. 403 is reserved
 * for the case where the caller already legitimately knows about the resource.
 */
export function assertOwner(job, uid) {
  if (!job) throw new ApiError(404, 'Search not found');
  const owner = job.uid || job.ownerUid || null;
  if (!owner || owner !== uid) throw new ApiError(404, 'Search not found');
  return job;
}

/* ── Rate limiting ──────────────────────────────────────────────────────
 *
 * LIMITATION, stated plainly: these counters live in the memory of one
 * Cloud Run instance. With max-instances > 1 a determined caller spread
 * across instances gets up to (limit x instances). They are a cost guard
 * against runaway clients and accidental loops, not a security boundary.
 * A global limit would need Firestore or Redis; see docs/ARCHITECTURE.md.
 */

const buckets = new Map();

function hit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, resetIn: Math.ceil(windowMs / 1000) };
  }
  b.count += 1;
  const resetIn = Math.ceil((b.reset - now) / 1000);
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetIn };
}

// Keep the map from growing without bound on a long-lived instance.
if (typeof setInterval === 'function') {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k);
  }, 5 * 60 * 1000);
  if (sweep.unref) sweep.unref();
}

export const LIMITS = {
  submit: { limit: 20, windowMs: 60 * 60 * 1000 },   // 20 BLAST submissions per hour
  analyze: { limit: 15, windowMs: 60 * 60 * 1000 },  // 15 Gemini calls per hour
  read: { limit: 600, windowMs: 60 * 60 * 1000 },    // polling and listing
  concurrentJobs: 3,                                  // simultaneous in-flight submissions
};

export function rateLimit(uid, kind) {
  const cfg = LIMITS[kind];
  if (!cfg) return;
  const r = hit(`${kind}:${uid}`, cfg.limit, cfg.windowMs);
  if (!r.ok) {
    throw new ApiError(
      429,
      'Rate limit reached',
      `You have used your ${cfg.limit} ${kind} requests for this window. Try again in about ${Math.ceil(r.resetIn / 60)} minute(s).`
    );
  }
}

/** Per-user concurrency, tracked while a submission's batches are running. */
const inFlight = new Map();

export function acquireSlot(uid) {
  const n = inFlight.get(uid) || 0;
  if (n >= LIMITS.concurrentJobs) {
    throw new ApiError(
      429,
      'Too many searches running',
      `You already have ${n} searches in progress. Wait for one to finish before starting another.`
    );
  }
  inFlight.set(uid, n + 1);
}

export function releaseSlot(uid) {
  const n = (inFlight.get(uid) || 1) - 1;
  if (n <= 0) inFlight.delete(uid);
  else inFlight.set(uid, n);
}

/**
 * Wrap a route handler so ApiError becomes a clean response and anything
 * unexpected becomes a 500 that does not leak internals to the client.
 */
export function handle(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, ...(err.detail ? { detail: err.detail } : {}) },
          { status: err.status }
        );
      }
      console.error('Unhandled API error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * RID allowlist. RIDs are generated as crypto.randomBytes(8).toString('hex'),
 * which is exactly 16 lowercase hex characters. Generation and validation are
 * defined together here so they cannot drift apart.
 */
export const RID_BYTES = 8;
export const RID_PATTERN = /^[a-f0-9]{16}$/;

export function isValidRid(rid) {
  return typeof rid === 'string' && RID_PATTERN.test(rid);
}

export function assertRid(rid) {
  if (!isValidRid(rid)) {
    throw new ApiError(400, 'Invalid request ID', 'Request IDs are 16 hexadecimal characters.');
  }
  return rid;
}

/** Parse and validate a comma-separated rid list, capped to keep responses bounded. */
export function parseRids(value, max = 100) {
  const list = String(value || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (list.length === 0) throw new ApiError(400, 'No request IDs supplied');
  if (list.length > max) throw new ApiError(400, `Too many request IDs (max ${max})`);
  for (const r of list) assertRid(r);
  return [...new Set(list)];
}

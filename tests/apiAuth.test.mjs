import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase-admin must not try to reach GCP metadata during a unit test.
vi.mock('firebase-admin/app', () => ({
  initializeApp: () => ({}), getApps: () => [{}], cert: () => ({}), applicationDefault: () => ({}),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));

const verifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));

const {
  requireAuth, authErrorFor, assertOwner, assertRid, parseRids, rateLimit,
  acquireSlot, releaseSlot, ApiError, LIMITS,
} = await import('@/lib/apiAuth');

const req = (headers = {}) => new Request('https://example.test/api/jobs', { headers });

beforeEach(() => verifyIdToken.mockReset());

describe('requireAuth (finding 01)', () => {
  const expect401 = async (r) => {
    let err;
    try { await requireAuth(r); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
  };

  it('rejects a request with no Authorization header', () => expect401(req()));

  it('rejects a non-Bearer scheme', () => expect401(req({ authorization: 'Basic abc' })));

  it('maps Admin SDK failures to 401 with an actionable message', () => {
    // Tested through the exported mapping rather than by making the mock
    // throw: vitest reports an error raised inside a mock implementation as
    // an unhandled test error even when the caller handles it correctly.
    expect(authErrorFor('auth/argument-error')).toMatchObject({
      status: 401, message: 'Invalid authentication',
    });
    expect(authErrorFor('auth/id-token-expired')).toMatchObject({
      status: 401, message: 'Session expired',
    });
    expect(authErrorFor('auth/id-token-revoked')).toMatchObject({
      status: 401, message: 'Session revoked',
    });
    expect(authErrorFor('auth/user-disabled')).toMatchObject({
      status: 401, message: 'Session revoked',
    });
    expect(authErrorFor(undefined).status).toBe(401);
  });

  it('rejects a token that verifies to no uid', async () => {
    verifyIdToken.mockImplementation(() => Promise.resolve({}));
    await expect401(req({ authorization: 'Bearer weird' }));
  });

  it('returns the uid from the verified token, never from the request', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'real-user', email: 'a@b.c', email_verified: true });
    const auth = await requireAuth(req({ authorization: 'Bearer good' }));
    expect(auth.uid).toBe('real-user');
  });

  it('checks for revocation', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u' });
    await requireAuth(req({ authorization: 'Bearer good' }));
    expect(verifyIdToken).toHaveBeenCalledWith('good', true);
  });
});

describe('assertOwner (finding 01)', () => {
  it('allows the owner through', () => {
    expect(() => assertOwner({ id: 'j', uid: 'alice' }, 'alice')).not.toThrow();
  });

  it('denies another user', () => {
    expect(() => assertOwner({ id: 'j', uid: 'alice' }, 'mallory')).toThrow(ApiError);
  });

  it('does not disclose that another user\'s job exists', () => {
    // 404, identical to a job that does not exist — otherwise 403 vs 404
    // would let an attacker enumerate valid job ids.
    let othersJob, missing;
    try { assertOwner({ id: 'j', uid: 'alice' }, 'mallory'); } catch (e) { othersJob = e; }
    try { assertOwner(null, 'mallory'); } catch (e) { missing = e; }
    expect(othersJob.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(othersJob.message).toBe(missing.message);
  });

  it('denies a job with no recorded owner', () => {
    expect(() => assertOwner({ id: 'j' }, 'alice')).toThrow(ApiError);
  });
});

describe('rid allowlisting (finding 03)', () => {
  it('accepts a well-formed rid', () => {
    expect(assertRid('0123456789abcdef')).toBe('0123456789abcdef');
  });

  it('rejects traversal and malformed input with 400', () => {
    for (const bad of ['../../etc/passwd', '/etc/passwd', '..', 'ABCDEF0123456789',
                       '0123456789abcde', '0123456789abcdefg', '', 'a/b']) {
      let err;
      try { assertRid(bad); } catch (e) { err = e; }
      expect(err, `expected rejection of ${JSON.stringify(bad)}`).toBeInstanceOf(ApiError);
      expect(err.status).toBe(400);
    }
  });

  it('validates every entry in a rid list', () => {
    expect(parseRids('0123456789abcdef,fedcba9876543210')).toHaveLength(2);
    expect(() => parseRids('0123456789abcdef,../../etc/passwd')).toThrow(ApiError);
  });

  it('de-duplicates and caps list length', () => {
    expect(parseRids('0123456789abcdef,0123456789abcdef')).toHaveLength(1);
    const many = Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(16, '0')).join(',');
    expect(() => parseRids(many)).toThrow(ApiError);
  });
});

describe('abuse limits (finding 04)', () => {
  it('lets a user through up to the limit, then returns 429', () => {
    const uid = `rl-${Math.random()}`;
    for (let i = 0; i < LIMITS.submit.limit; i++) rateLimit(uid, 'submit');
    let err;
    try { rateLimit(uid, 'submit'); } catch (e) { err = e; }
    expect(err.status).toBe(429);
  });

  it('tracks users independently', () => {
    const a = `rl-a-${Math.random()}`, b = `rl-b-${Math.random()}`;
    for (let i = 0; i < LIMITS.analyze.limit; i++) rateLimit(a, 'analyze');
    expect(() => rateLimit(b, 'analyze')).not.toThrow();
  });

  it('caps concurrent searches per user and releases slots', () => {
    const uid = `slot-${Math.random()}`;
    for (let i = 0; i < LIMITS.concurrentJobs; i++) acquireSlot(uid);
    expect(() => acquireSlot(uid)).toThrow(ApiError);
    releaseSlot(uid);
    expect(() => acquireSlot(uid)).not.toThrow();
  });
});

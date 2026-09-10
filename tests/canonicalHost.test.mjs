import { describe, it, expect } from 'vitest';
import {
  CANONICAL_HOST, isCanonicalHost, isDeploymentHost, isLocalHost, canonicalHostFrom,
} from '@/lib/canonicalHost';

const H = (o) => new Headers(o);

describe('host classification', () => {
  it('accepts the apex and www, any case, with or without a port', () => {
    for (const h of ['superblast.app', 'www.superblast.app', 'SuperBlast.App', 'superblast.app:443']) {
      expect(isCanonicalHost(h), h).toBe(true);
    }
  });

  it('rejects lookalikes', () => {
    for (const h of ['superblast.app.evil.com', 'notsuperblast.app', '', null]) {
      expect(isCanonicalHost(h), String(h)).toBe(false);
    }
  });

  it('recognises Cloud Run deployment hosts', () => {
    expect(isDeploymentHost('blasthub-523316980019.us-east4.run.app')).toBe(true);
    expect(isDeploymentHost('blasthub-6olxkrgdrq-uc.a.run.app')).toBe(true);
    expect(isDeploymentHost('superblast.app')).toBe(false);
  });

  it('recognises local development', () => {
    expect(isLocalHost('localhost:3300')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
  });

  it('defaults to the production domain', () => {
    expect(CANONICAL_HOST).toBe('superblast.app');
  });
});

/**
 * The regression this file exists for: Firebase Hosting rewrites Host to the
 * Cloud Run name, so checking Host alone made the CANONICAL site serve
 * "Disallow: /" — it briefly told Google to de-index superblast.app.
 */
describe('canonicalHostFrom — the Firebase Hosting rewrite', () => {
  it('trusts x-forwarded-host over a rewritten Host', () => {
    const r = canonicalHostFrom(H({
      host: 'blasthub-6olxkrgdrq-uc.a.run.app',
      'x-forwarded-host': 'superblast.app',
    }));
    expect(r.canonical).toBe(true);
    expect(r.observedHost).toBe('superblast.app');
    expect(r.via).toBe('x-forwarded-host');
  });

  it('treats www via the proxy as canonical too', () => {
    expect(canonicalHostFrom(H({
      host: 'blasthub-6olxkrgdrq-uc.a.run.app',
      'x-forwarded-host': 'www.superblast.app',
    })).canonical).toBe(true);
  });

  it('takes only the first value of a multi-value forwarded header', () => {
    expect(canonicalHostFrom(H({
      'x-forwarded-host': 'superblast.app, some-proxy.internal',
    })).canonical).toBe(true);
  });

  it('parses an RFC 7239 Forwarded header', () => {
    const r = canonicalHostFrom(H({ host: 'x.run.app', forwarded: 'for=1.2.3.4;host=superblast.app;proto=https' }));
    expect(r.canonical).toBe(true);
    expect(r.via).toBe('forwarded');
  });

  it('marks a direct hit on the deployment URL as NOT canonical', () => {
    const r = canonicalHostFrom(H({ host: 'blasthub-523316980019.us-east4.run.app' }));
    expect(r.canonical).toBe(false);
    expect(r.via).toBe('host:run.app');
  });

  it('honours a forwarded host that is genuinely a deployment URL', () => {
    expect(canonicalHostFrom(H({
      host: 'a.run.app', 'x-forwarded-host': 'blasthub-523316980019.us-east4.run.app',
    })).canonical).toBe(false);
  });

  it('treats the canonical domain arriving directly as canonical', () => {
    expect(canonicalHostFrom(H({ host: 'superblast.app' })).via).toBe('host');
  });

  it('treats localhost as canonical so development is not blocked', () => {
    expect(canonicalHostFrom(H({ host: 'localhost:3300' })).canonical).toBe(true);
  });

  it('FAILS OPEN on an unknown host rather than risking de-indexing', () => {
    const r = canonicalHostFrom(H({ host: 'something-unexpected.example' }));
    expect(r.canonical).toBe(true);
    expect(r.via).toBe('default-allow');
  });

  it('fails open when there are no headers at all', () => {
    expect(canonicalHostFrom(H({})).canonical).toBe(true);
  });
});

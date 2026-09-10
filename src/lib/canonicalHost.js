/**
 * Which hostname is this request really for?
 *
 * The container answers on several hostnames — the canonical domain via
 * Firebase Hosting, plus the raw Cloud Run *.run.app URLs in each region.
 * Only the canonical one should be indexed or used in generated links.
 *
 * The trap: Firebase Hosting **rewrites the `Host` header** to the Cloud Run
 * hostname before proxying, so a request that arrived at superblast.app looks
 * identical to one sent straight to blasthub-….run.app. The original host, if
 * it survives at all, is in a forwarded-host header.
 *
 * Because of that ambiguity the default here is deliberately ALLOW: a request
 * is treated as a deployment URL only when that can be positively identified.
 * Guessing "not canonical" for the real domain de-indexes the live site, which
 * is a far worse outcome than a deployment URL occasionally being crawlable.
 */

export const CANONICAL_HOST = process.env.CANONICAL_HOST || 'superblast.app';

const bare = (h) => String(h || '').split(',')[0].trim().split(':')[0].toLowerCase();

/** `www.` counts as canonical: it 301s to the apex at the hosting layer. */
export function isCanonicalHost(host) {
  const b = bare(host);
  if (!b) return false;
  return b === CANONICAL_HOST || b === `www.${CANONICAL_HOST}`;
}

/** A Cloud Run generated hostname, e.g. blasthub-….a.run.app */
export function isDeploymentHost(host) {
  const b = bare(host);
  return !!b && b.endsWith('.run.app');
}

export function isLocalHost(host) {
  const b = bare(host);
  return b === 'localhost' || b === '127.0.0.1' || b === '0.0.0.0';
}

/**
 * Headers that may carry the host the client originally asked for, most
 * trustworthy first. Firebase Hosting and the Google Front End differ in which
 * they set, so all are consulted.
 */
const FORWARDED_HOST_HEADERS = [
  'x-forwarded-host',
  'x-original-host',
  'x-original-forwarded-host',
  'x-host',
];

/**
 * @param {Headers} headers request headers
 * @returns {{canonical: boolean, observedHost: string, via: string}}
 */
export function canonicalHostFrom(headers) {
  const get = (n) => (typeof headers?.get === 'function' ? headers.get(n) : undefined);

  // 1. An explicit forwarded host is the strongest signal available.
  for (const name of FORWARDED_HOST_HEADERS) {
    const v = get(name);
    if (v) return { canonical: isCanonicalHost(v), observedHost: bare(v), via: name };
  }

  // 2. RFC 7239 — Forwarded: host=example.com
  const fwd = get('forwarded');
  if (fwd) {
    const m = /host=("?)([^;,"]+)\1/i.exec(fwd);
    if (m) return { canonical: isCanonicalHost(m[2]), observedHost: bare(m[2]), via: 'forwarded' };
  }

  const host = get('host') || '';

  // 3. The canonical domain arriving directly.
  if (isCanonicalHost(host)) return { canonical: true, observedHost: bare(host), via: 'host' };

  // 4. Local development is not a deployment URL.
  if (isLocalHost(host)) return { canonical: true, observedHost: bare(host), via: 'localhost' };

  // 5. A *.run.app host with no forwarded header is genuinely ambiguous: either
  //    a direct hit on the deployment URL, or Firebase Hosting having rewritten
  //    Host. Proxy markers distinguish them; fall back to ALLOW if unsure.
  if (isDeploymentHost(host)) {
    const viaHdr = (get('via') || '').toLowerCase();
    const proxied = get('x-firebase-hosting') || viaHdr.includes('firebase');
    if (proxied) return { canonical: true, observedHost: bare(host), via: 'proxy-marker' };
    return { canonical: false, observedHost: bare(host), via: 'host:run.app' };
  }

  // 6. Unknown host — allow rather than risk de-indexing.
  return { canonical: true, observedHost: bare(host) || 'unknown', via: 'default-allow' };
}

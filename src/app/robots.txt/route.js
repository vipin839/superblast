import { CANONICAL_HOST, canonicalHostFrom } from '@/lib/canonicalHost';

export const dynamic = 'force-dynamic';

/**
 * Host-aware robots.txt.
 *
 * Firebase Hosting rewrites the `Host` header to the Cloud Run hostname before
 * proxying, so `Host` alone cannot distinguish the canonical domain from a
 * deployment URL. canonicalHostFrom() consults forwarded-host headers and
 * defaults to ALLOW when it cannot tell — de-indexing the live site is a much
 * worse failure than a deployment URL being crawlable.
 *
 * The `#` lines below are robots.txt comments (ignored by crawlers) recording
 * how the decision was reached, so this stays diagnosable in production.
 */
export async function GET(request) {
  const { canonical, observedHost, via } = canonicalHostFrom(request.headers);

  if (!canonical) {
    return new Response(
      `# ${observedHost} is a deployment URL, not the canonical site.\n` +
      `# The indexable site is https://${CANONICAL_HOST}\n` +
      'User-agent: *\n' +
      'Disallow: /\n',
      { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' } }
    );
  }

  return new Response(
    `# canonical: ${observedHost} (resolved via ${via})\n` +
    'User-agent: *\n' +
    'Allow: /$\n' +
    'Disallow: /api/\n' +
    'Disallow: /dashboard\n' +
    'Disallow: /search\n' +
    'Disallow: /history\n' +
    'Disallow: /settings\n' +
    '\n' +
    `Sitemap: https://${CANONICAL_HOST}/sitemap.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

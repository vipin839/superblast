import { CANONICAL_HOST, canonicalHostFrom } from '@/lib/canonicalHost';

export const dynamic = 'force-dynamic';

/**
 * Only the landing page is public; everything else is behind Google sign-in
 * and is per-user, so the sitemap has exactly one entry. Non-canonical hosts
 * get an empty sitemap so a deployment URL cannot advertise itself.
 *
 * Uses canonicalHostFrom() rather than the raw Host header: Firebase Hosting
 * rewrites Host to the Cloud Run name and carries the real one in
 * x-forwarded-host.
 */
export async function GET(request) {
  const { canonical } = canonicalHostFrom(request.headers);

  const body = canonical
    ? `  <url>\n    <loc>https://${CANONICAL_HOST}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`
    : '';

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
}

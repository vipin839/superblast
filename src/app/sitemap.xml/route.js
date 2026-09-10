import { CANONICAL_HOST, canonicalHostFrom } from '@/lib/canonicalHost';

export const dynamic = 'force-dynamic';

/**
 * The landing page and /about are the only public pages; everything else is
 * behind Google sign-in and is per-user. Non-canonical hosts get an empty
 * sitemap so a deployment URL cannot advertise itself.
 *
 * Uses canonicalHostFrom() rather than the raw Host header: Firebase Hosting
 * rewrites Host to the Cloud Run name and carries the real one in
 * x-forwarded-host.
 */
const PUBLIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
];

export async function GET(request) {
  const { canonical } = canonicalHostFrom(request.headers);

  const body = canonical
    ? PUBLIC_PAGES.map(({ path, changefreq, priority }) =>
      `  <url>\n    <loc>https://${CANONICAL_HOST}${path}</loc>\n`
      + `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`
    ).join('')
    : '';

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
}

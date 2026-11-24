/**
 * FONTS_ORIGIN, checked: where /fonts/lib/* is passed through to when the fonts bucket serves the
 * library. Only a Cloud Storage bucket address (https://storage.googleapis.com/<bucket>) is taken,
 * so a typo or a planted value can't turn our own /fonts/lib/ into a proxy for another site. A
 * loopback address is also taken, for trying a library built on this machine.
 * Returns "" when unset; throws on anything else.
 *
 * @param {string | undefined} raw
 */
export function fontsOrigin(raw) {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https:\/\/storage\.googleapis\.com\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(value)) return value;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}(\/[a-z0-9-]+)?$/.test(value)) return value;
  throw new Error(`FONTS_ORIGIN must be https://storage.googleapis.com/<bucket>, got "${value}"`);
}

/**
 * The only paths under /fonts/lib/ that are passed through to the bucket, as Next.js route
 * patterns relative to it. Every part is spelled out (no catch-all), so dot segments or an
 * encoded "../" can't reach another bucket on the same host, and nothing but the library's own
 * file kinds is ever served from our address. (No groups inside a pattern: the router refuses them.)
 */
export const FONT_LIBRARY_PATHS = [
  { source: "manifest.json", destination: "manifest.json" },
  { source: "index/:file(families\\.[0-9a-f]{8}\\.json)", destination: "index/:file" },
  { source: "index/:file(faces\\.[0-9a-f]{8}\\.json)", destination: "index/:file" },
  { source: "index/:file(features\\.[0-9a-f]{8}\\.bin)", destination: "index/:file" },
  { source: "index/sig/:file([a-z0-9_-]+\\.[0-9a-f]{8}\\.bin)", destination: "index/sig/:file" },
  { source: "families/:file([a-z0-9-]+\\.[0-9a-f]{8}\\.json)", destination: "families/:file" },
  { source: "fonts/:id([a-z0-9-]+)/:file([a-z0-9-]+\\.[0-9a-f]{8}\\.woff)", destination: "fonts/:id/:file" },
  { source: "licences/:file([a-z0-9-]+\\.txt)", destination: "licences/:file" },
];

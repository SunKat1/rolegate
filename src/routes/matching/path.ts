/**
 * How we read a request path before comparing it to any rule.
 *
 * The goal is to see the path the way the most generous thing behind the
 * guard would see it. Express's own router is strict, but `express.static`,
 * nginx and friends happily decode "%2e%2e" and resolve "..". If we compared
 * the raw string, "/public/../admin/secret.html" would pass an allow for
 * "/public/*" and then get served from /admin.
 */

/**
 * Splits a path into the segments we actually compare. Step by step:
 *
 *   1. drop the query string and the hash;
 *   2. percent-decode every segment, and treat a decoded "/" or "\" as a separator;
 *   3. resolve "." and "..", the way a browser does;
 *   4. drop empty segments, so "//a//b/" is the same as "/a/b";
 *   5. lowercase everything, because Express and React Router match
 *      case-insensitively by default and "/ADMIN" must not slip past "/admin/*".
 *
 * Returns null when the path has broken percent-encoding, like "%zz".
 * We can't tell what such a path points to, so callers treat it as "no access".
 */
export function splitPath(path: string): string[] | null {
  const withoutQuery = String(path).split(/[?#]/, 1)[0];
  const segments: string[] = [];

  for (const piece of withoutQuery.split('/')) {
    const decoded = decode(piece);
    if (decoded === null) return null;

    // "a%2Fb" or "a\b" can become two segments for a static file server,
    // so they are two segments for us as well.
    for (const segment of decoded.split(/[/\\]/)) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment.toLowerCase());
    }
  }
  return segments;
}

/**
 * The path as a string, in the form the checks see it:
 * "/Posts/./42/?tab=1" becomes "/posts/42". Handy for debugging a rule.
 *
 * Unlike `splitPath` this never fails. Segments with broken encoding are just
 * kept as they are. Access checks don't use this function: they deny such
 * paths outright.
 */
export function normalizePath(path: string): string {
  const segments = splitPath(path);
  if (segments) return '/' + segments.join('/');

  const withoutQuery = String(path).split(/[?#]/, 1)[0];
  return '/' + withoutQuery.split('/').filter(Boolean).join('/').toLowerCase();
}

function decode(piece: string): string | null {
  try {
    return decodeURIComponent(piece);
  } catch {
    return null;
  }
}

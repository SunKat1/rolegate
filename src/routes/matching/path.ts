// We read a path the way express.static or nginx would: decoded, with ".."
// resolved. Otherwise "/public/../admin" would pass an allow for "/public/*"
// and the static server would happily serve /admin.

/**
 * "/Public/%2e%2e/Admin/?x=1" -> ["admin"].
 *
 * Drops the query and hash, decodes %xx, resolves "." and "..", skips empty
 * segments and lowercases (routers ignore case by default).
 * Returns null for broken encoding like "%zz", and callers deny such paths.
 */
export function splitPath(path: string): string[] | null {
  const withoutQuery = String(path).split(/[?#]/, 1)[0];
  const segments: string[] = [];

  for (const piece of withoutQuery.split('/')) {
    const decoded = decode(piece);
    if (decoded === null) return null;

    // a decoded "%2F" or a "\" splits the segment, same as on a static server
    for (const segment of decoded.split(/[/\\]/)) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment.toLowerCase());
    }
  }
  return segments;
}

/**
 * The path as the checks see it: "/Posts/./42/?tab=1" -> "/posts/42".
 * Never throws, broken %xx is just left as is. Handy for debugging rules.
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

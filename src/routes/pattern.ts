/**
 * Tiny route patterns. On purpose there are only three kinds of segments:
 *
 *   /settings       a plain segment, has to match exactly
 *   /posts/:id      a parameter, matches any single non-empty segment
 *   /admin/*        a wildcard, only at the end: "/admin" and everything below it
 *
 * Plus a lone '*' meaning "any path at all".
 *
 * Anything fancier (regex params, optional segments, a '*' in the middle) throws
 * right away. Patterns often come from a database, and a pattern that
 * silently matches nothing is much worse than an error on startup.
 */

export interface RoutePattern {
  /** The pattern exactly as it was written, handy in error messages. */
  readonly source: string;
  /** Checks an already split path (see `splitPath`). */
  matches(segments: readonly string[]): boolean;
  /** Same, for a raw path. A path we can't make sense of never matches. */
  test(path: string): boolean;
}

/**
 * Splits a request path into the segments we actually compare.
 *
 * The idea is to see the path the same way the most generous thing behind
 * the guard would see it. Express's router is strict, but `express.static`,
 * nginx and friends happily decode "%2e%2e" and resolve "..". If we compared
 * the raw string, "/public/../admin/secret.html" would pass an allow for
 * "/public/*" and then get served from /admin. So we:
 *
 *   - drop the query string and hash,
 *   - percent-decode every segment (and treat a decoded "/" or "\" as a separator),
 *   - resolve "." and "..", like a browser does,
 *   - drop empty segments, so "//a//b/" is "/a/b",
 *   - lowercase everything, because Express and React Router match
 *     case-insensitively by default and "/ADMIN" must not slip past "/admin/*".
 *
 * Returns null when the path has broken percent-encoding ("%zz"). Callers
 * treat that as "no access": we can't tell what such a path points to.
 */
export function splitPath(path: string): string[] | null {
  const raw = String(path).split(/[?#]/, 1)[0];
  const out: string[] = [];

  for (const piece of raw.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(piece);
    } catch {
      return null;
    }
    // "a%2Fb" or "a\b" can turn into two segments for a static file server,
    // so they're two segments for us too.
    for (const segment of decoded.split(/[/\\]/)) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') out.pop();
      else out.push(segment.toLowerCase());
    }
  }
  return out;
}

/**
 * Brings a path to the form we compare against, see `splitPath` for the rules:
 * "/Posts/./42/?tab=1" becomes "/posts/42".
 *
 * Segments with broken percent-encoding are kept as they are, so this never
 * throws. Access checks don't go through here: they deny such paths outright.
 */
export function normalizePath(path: string): string {
  const segments = splitPath(path);
  if (segments) return '/' + segments.join('/');

  const raw = String(path).split(/[?#]/, 1)[0];
  return '/' + raw.split('/').filter(Boolean).join('/').toLowerCase();
}

const PARAM = /^:[A-Za-z0-9_]+$/;

export function compilePattern(pattern: string): RoutePattern {
  const fail = (why: string): never => {
    throw new Error(`rolegate: bad route pattern "${pattern}": ${why}`);
  };

  if (pattern === '*') {
    return { source: pattern, matches: () => true, test: (path) => splitPath(path) !== null };
  }
  if (typeof pattern !== 'string' || !pattern.startsWith('/')) fail('it should start with "/" (or be just "*")');
  if (/[?#]/.test(pattern)) fail('query strings and hashes are not part of a route');
  // "/public/../admin" in a pattern is almost certainly a mistake, and resolving
  // it quietly would hide what the rule really covers.
  if (pattern.split(/[/\\]/).some((s) => s === '.' || s === '..')) fail('"." and ".." segments are not allowed');

  const parts = splitPath(pattern) ?? fail('it has broken percent-encoding');
  const wildcard = parts[parts.length - 1] === '*';
  const fixed = wildcard ? parts.slice(0, -1) : parts;

  for (const part of fixed) {
    if (part.includes('*')) fail('"*" is only allowed as the last segment, like "/admin/*"');
    if (part.startsWith(':') && !PARAM.test(part)) fail(`"${part}" is not a valid parameter (use something like ":id")`);
  }

  const matches = (actual: readonly string[]) => {
    if (wildcard ? actual.length < fixed.length : actual.length !== fixed.length) return false;
    // Empty segments never survive splitPath, so a :param always gets something.
    return fixed.every((part, i) => part.startsWith(':') || part === actual[i]);
  };

  return {
    source: pattern,
    matches,
    test(path) {
      const segments = splitPath(path);
      return segments !== null && matches(segments);
    },
  };
}

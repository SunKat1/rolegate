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
  test(path: string): boolean;
}

/**
 * Brings a path to the form we compare against:
 * no query or hash, no repeated or trailing slashes, lowercase.
 *
 * Lowercase because Express and React Router both match routes case-insensitively
 * by default. If we were stricter than the router, someone could open
 * "/ADMIN/users", slip past a deny written for "/admin/*" and still land on the admin page.
 */
export function normalizePath(path: string): string {
  let clean = path.split(/[?#]/, 1)[0];
  clean = ('/' + clean).replace(/\/{2,}/g, '/');
  if (clean.length > 1) clean = clean.replace(/\/$/, '');
  return clean.toLowerCase();
}

const PARAM = /^:[A-Za-z0-9_]+$/;

function segmentsOf(path: string): string[] {
  // "/" -> [], "/posts/42" -> ["posts", "42"]
  return path === '/' ? [] : path.slice(1).split('/');
}

export function compilePattern(pattern: string): RoutePattern {
  const fail = (why: string): never => {
    throw new Error(`rolegate: bad route pattern "${pattern}": ${why}`);
  };

  if (pattern === '*') return { source: pattern, test: () => true };
  if (typeof pattern !== 'string' || !pattern.startsWith('/')) fail('it should start with "/" (or be just "*")');
  if (/[?#]/.test(pattern)) fail('query strings and hashes are not part of a route');

  const parts = segmentsOf(normalizePath(pattern));
  const wildcard = parts[parts.length - 1] === '*';
  const fixed = wildcard ? parts.slice(0, -1) : parts;

  for (const part of fixed) {
    if (part.includes('*')) fail('"*" is only allowed as the last segment, like "/admin/*"');
    if (part.startsWith(':') && !PARAM.test(part)) fail(`"${part}" is not a valid parameter (use something like ":id")`);
  }

  return {
    source: pattern,
    test(path) {
      const actual = segmentsOf(normalizePath(path));
      if (wildcard ? actual.length < fixed.length : actual.length !== fixed.length) return false;
      return fixed.every((part, i) => (part.startsWith(':') ? actual[i] !== '' : part === actual[i]));
    },
  };
}

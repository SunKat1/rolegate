/**
 * Tiny route patterns. On purpose there are only three kinds of segments:
 *
 *   /settings       a plain segment, has to match exactly
 *   /posts/:id      a parameter, matches any single segment
 *   /admin/*        a wildcard, only at the end: "/admin" and everything below it
 *
 * Plus a lone '*' meaning "any path at all".
 *
 * Anything fancier (regex params, optional segments, a '*' in the middle) throws
 * right away. Patterns often come from a database, and a pattern that
 * silently matches nothing is much worse than an error on startup.
 */

import { splitPath } from './path.js';

export interface RoutePattern {
  /** The pattern exactly as it was written, handy in error messages. */
  readonly source: string;
  /** Checks a path that has already gone through `splitPath`. */
  matches(segments: readonly string[]): boolean;
  /** The same for a raw path. A path we can't make sense of never matches. */
  test(path: string): boolean;
}

const PARAM = /^:[A-Za-z0-9_]+$/;

export function compilePattern(pattern: string): RoutePattern {
  const fail = (why: string): never => {
    throw new Error(`rolegate: bad route pattern "${pattern}": ${why}`);
  };

  if (pattern === '*') return fromMatcher(pattern, () => true);

  if (typeof pattern !== 'string' || !pattern.startsWith('/')) fail('it should start with "/" (or be just "*")');
  if (/[?#]/.test(pattern)) fail('query strings and hashes are not part of a route');
  // "/public/../admin" in a rule is almost surely a typo, and resolving it
  // quietly would hide what the rule really covers.
  if (pattern.split(/[/\\]/).some((s) => s === '.' || s === '..')) fail('"." and ".." segments are not allowed');

  // Patterns go through the same splitting as paths, so "/Admin/%20x" in a
  // rule and "/admin/ x" in a request end up equal.
  const parts = splitPath(pattern) ?? fail('it has broken percent-encoding');
  const wildcard = parts[parts.length - 1] === '*';
  const fixed = wildcard ? parts.slice(0, -1) : parts;

  for (const part of fixed) {
    if (part.includes('*')) fail('"*" is only allowed as the last segment, like "/admin/*"');
    if (part.startsWith(':') && !PARAM.test(part)) fail(`"${part}" is not a valid parameter (use something like ":id")`);
  }

  return fromMatcher(pattern, (actual) => {
    const lengthFits = wildcard ? actual.length >= fixed.length : actual.length === fixed.length;
    if (!lengthFits) return false;
    // splitPath never leaves empty segments, so a :param always gets something real.
    return fixed.every((part, i) => part.startsWith(':') || part === actual[i]);
  });
}

function fromMatcher(source: string, matches: (segments: readonly string[]) => boolean): RoutePattern {
  return {
    source,
    matches,
    test(path) {
      const segments = splitPath(path);
      return segments !== null && matches(segments);
    },
  };
}

/**
 * Route rules as the engine keeps them: the pattern is compiled, the methods
 * are uppercased and sitting in a Set. This file turns what's written in the
 * config into that form and answers "does any of these rules hit this request?".
 */

import { configError, isObject } from '../shared/validate.js';
import { compilePattern } from './matching/pattern.js';
import type { RoutePattern } from './matching/pattern.js';
import type { RouteRule } from './types.js';

export interface CompiledRule {
  pattern: RoutePattern;
  /** null means "any method". */
  methods: ReadonlySet<string> | null;
}

/**
 * Uppercases the method and maps HEAD to GET. Express runs GET handlers for
 * HEAD requests, so HEAD has to obey GET rules. Otherwise a HEAD request
 * would get around a GET deny.
 */
export function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  return upper === 'HEAD' ? 'GET' : upper;
}

/** Compiles the allow (or deny) list of one role. */
export function compileRules(list: RouteRule[] | undefined, role: string, kind: 'allow' | 'deny'): CompiledRule[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) configError(`${kind} of role "${role}" should be a list of routes`);

  return list.map((rule) => {
    try {
      return compileRule(rule);
    } catch (err) {
      // Say which role the bad rule belongs to. With rules from a database,
      // that's the first thing you'll want to know.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (in role "${role}")`);
    }
  });
}

/** Does any of the rules cover this path and method? */
export function hits(rules: CompiledRule[], segments: readonly string[], method: string): boolean {
  return rules.some((rule) => {
    const methodFits = rule.methods === null || rule.methods.has(method);
    return methodFits && rule.pattern.matches(segments);
  });
}

function compileRule(rule: RouteRule): CompiledRule {
  // The short form: just a path, any method.
  if (typeof rule === 'string') return { pattern: compilePattern(rule), methods: null };

  if (!isObject(rule) || typeof rule.path !== 'string') {
    configError('a route rule should be a path or { path, methods? }');
  }
  const pattern = compilePattern(rule.path);
  const { methods } = rule;

  if (methods === undefined) return { pattern, methods: null };
  if (!Array.isArray(methods) || methods.some((m) => typeof m !== 'string' || m === '')) {
    configError(`"methods" for "${rule.path}" should be a list like ['GET', 'POST']`);
  }
  if (methods.length === 0) configError(`"methods" for "${rule.path}" is empty`);
  if (methods.includes('*')) return { pattern, methods: null };

  return { pattern, methods: new Set(methods.map(normalizeMethod)) };
}

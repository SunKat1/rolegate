// Route rules from the config, compiled once: pattern parsed, methods in a Set.

import { configError, isObject } from '../shared/validate.js';
import { compilePattern } from './matching/pattern.js';
import type { RoutePattern } from './matching/pattern.js';
import type { RouteRule } from './types.js';

export interface CompiledRule {
  pattern: RoutePattern;
  /** null means "any method". */
  methods: ReadonlySet<string> | null;
  /** Where it came from, for explain(). */
  info: RouteRuleInfo;
}

/** The rule that decided, as explain() reports it. */
export interface RouteRuleInfo {
  effect: 'allow' | 'deny';
  /** The role the rule is written in. With `extends`, that's the parent. */
  role: string;
  /** The pattern as written in the config, e.g. '/posts/:id'. */
  path: string;
  /** null means any method. */
  methods: string[] | null;
}

/** Express runs GET handlers for HEAD, so HEAD follows GET rules. Otherwise it would dodge a GET deny. */
export function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  return upper === 'HEAD' ? 'GET' : upper;
}

/** Compiles the allow (or deny) list of one role. */
export function compileRules(list: readonly RouteRule[] | undefined, role: string, kind: 'allow' | 'deny'): CompiledRule[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) configError(`${kind} of role "${role}" should be a list of routes`);

  return list.map((rule) => {
    try {
      const { pattern, methods } = compileRule(rule);
      const path = typeof rule === 'string' ? rule : rule.path;
      return { pattern, methods, info: { effect: kind, role, path, methods: methods && [...methods] } };
    } catch (err) {
      // with rules from a DB you'll want to know which role it is
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (in role "${role}")`);
    }
  });
}

/** The first rule that covers this path and method. */
export function findHit(rules: CompiledRule[], segments: readonly string[], method: string): CompiledRule | undefined {
  return rules.find((rule) => {
    const methodFits = rule.methods === null || rule.methods.has(method);
    return methodFits && rule.pattern.matches(segments);
  });
}

export function routeRuleText(info: RouteRuleInfo): string {
  const methods = info.methods ? info.methods.join(', ') + ' ' : '';
  return `role "${info.role}" ${info.effect === 'allow' ? 'allows' : 'denies'} ${methods}${info.path}`;
}

function compileRule(rule: RouteRule): Omit<CompiledRule, 'info'> {
  // just a path means any method
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

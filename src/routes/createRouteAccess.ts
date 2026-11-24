import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, configError, dictionary, isObject } from '../shared/validate.js';
import { compilePattern, splitPath } from './pattern.js';
import type { RoutePattern } from './pattern.js';
import type { RouteAccess, RouteAccessConfig, RouteRule } from './types.js';

/** A rule that is ready to check: pattern compiled, methods uppercased. */
interface CompiledRule {
  pattern: RoutePattern;
  /** null means "any method". */
  methods: ReadonlySet<string> | null;
}

function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  // Express runs GET handlers for HEAD requests, so HEAD has to obey GET rules,
  // otherwise a HEAD request would get around a GET deny.
  return upper === 'HEAD' ? 'GET' : upper;
}

function compileRule(rule: RouteRule, role: string): CompiledRule {
  try {
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
  } catch (err) {
    // Say which role the bad rule belongs to. With rules from a database,
    // that's the first thing you'll want to know.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (in role "${role}")`);
  }
}

function compileList(list: RouteRule[] | undefined, role: string, kind: 'allow' | 'deny'): CompiledRule[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) configError(`${kind} of role "${role}" should be a list of routes`);
  return list.map((rule) => compileRule(rule, role));
}

function hits(rules: CompiledRule[], segments: readonly string[], method: string): boolean {
  return rules.some((r) => (r.methods === null || r.methods.has(method)) && r.pattern.matches(segments));
}

/**
 * Builds the route checker:
 *
 *   const pages = createRouteAccess({
 *     roles: {
 *       user:  { allow: ['/', '/posts/*'] },
 *       admin: { extends: ['user'], allow: ['/admin/*'] },
 *     },
 *   });
 *   pages.can('user', '/posts/42');   // true
 *   pages.can('user', '/admin/users'); // false
 */
export function createRouteAccess(config: RouteAccessConfig): RouteAccess {
  checkRolesObject(config?.roles);
  const definitions = dictionary<RoleDefinition<CompiledRule>>();
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: compileList(role.allow, name, 'allow'),
      deny: compileList(role.deny, name, 'deny'),
    };
  }
  const known = resolveRoles(definitions);

  const can: RouteAccess['can'] = (roles, path, method = 'GET') => {
    // A path we can't decode could point anywhere, so it gets a flat no
    // instead of a guess. Same for a method that isn't a string.
    const segments = splitPath(path);
    if (segments === null || typeof method !== 'string') return false;

    const m = normalizeMethod(method);
    return decide(
      pickRoles(known, roles),
      (role) => hits(role.deny, segments, m),
      (role) => hits(role.allow, segments, m),
    );
  };

  return {
    can,
    assert(roles, path, method = 'GET') {
      if (!can(roles, path, method)) throw new ForbiddenError(path, method.toUpperCase());
    },
    roles: Object.keys(config.roles),
  };
}

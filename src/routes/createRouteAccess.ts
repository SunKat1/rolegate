import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { compilePattern } from './pattern.js';
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

    const pattern = compilePattern(rule.path);
    if (!rule.methods || rule.methods.includes('*')) return { pattern, methods: null };
    if (rule.methods.length === 0) throw new Error(`rolegate: "methods" for "${rule.path}" is empty`);
    return { pattern, methods: new Set(rule.methods.map(normalizeMethod)) };
  } catch (err) {
    // Say which role the bad rule belongs to. With rules from a database,
    // that's the first thing you'll want to know.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (in role "${role}")`);
  }
}

function hits(rules: CompiledRule[], path: string, method: string): boolean {
  return rules.some((r) => (r.methods === null || r.methods.has(method)) && r.pattern.test(path));
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
  const definitions: Record<string, RoleDefinition<CompiledRule>> = {};
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: (role.allow ?? []).map((r) => compileRule(r, name)),
      deny: (role.deny ?? []).map((r) => compileRule(r, name)),
    };
  }
  const known = resolveRoles(definitions);

  const can: RouteAccess['can'] = (roles, path, method = 'GET') => {
    const m = normalizeMethod(method);
    return decide(
      pickRoles(known, roles),
      (role) => hits(role.deny, path, m),
      (role) => hits(role.allow, path, m),
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

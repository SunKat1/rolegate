import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, dictionary } from '../shared/validate.js';
import { splitPath } from './matching/path.js';
import { compileRules, hits, normalizeMethod } from './rules.js';
import type { CompiledRule } from './rules.js';
import type { RouteAccess, RouteAccessConfig } from './types.js';

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
 *
 * All the rules are compiled here, once. A broken rule throws now, while the
 * app is starting, and not on the first request that happens to hit it.
 */
export function createRouteAccess(config: RouteAccessConfig): RouteAccess {
  checkRolesObject(config?.roles);

  const definitions = dictionary<RoleDefinition<CompiledRule>>();
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: compileRules(role.allow, name, 'allow'),
      deny: compileRules(role.deny, name, 'deny'),
    };
  }
  const known = resolveRoles(definitions);

  const can: RouteAccess['can'] = (roles, path, method = 'GET') => {
    // A path we can't decode could point anywhere, so it gets a flat no
    // instead of a guess. The same goes for a method that isn't a string.
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
      if (!can(roles, path, method)) throw new ForbiddenError(path, String(method).toUpperCase());
    },
    roles: Object.keys(config.roles),
  };
}

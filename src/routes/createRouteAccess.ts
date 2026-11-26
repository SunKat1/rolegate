import { explain } from '../shared/decision.js';
import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, dictionary } from '../shared/validate.js';
import { normalizePath, splitPath } from './matching/path.js';
import { compileRules, findHit, normalizeMethod, routeRuleText } from './rules.js';
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
 * Rules are compiled here, so a broken one throws on startup.
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
    // can't decode the path - can't know where it goes, so no
    const segments = splitPath(path);
    if (segments === null || typeof method !== 'string') return false;

    const m = normalizeMethod(method);
    return decide(
      pickRoles(known, roles),
      (role) => findHit(role.deny, segments, m) !== undefined,
      (role) => findHit(role.allow, segments, m) !== undefined,
    );
  };

  const explainRoute: RouteAccess['explain'] = (roles, path, method = 'GET') => {
    const segments = splitPath(path);
    const m = typeof method === 'string' ? normalizeMethod(method) : String(method);
    const subject = `${m} ${normalizePath(path)}`;

    if (segments === null || typeof method !== 'string') {
      const message = `denied ${subject}: the path can't be decoded`;
      return { allowed: false, reason: 'bad-path', unknownRoles: [], message, path: normalizePath(path) };
    }

    const decision = explain({
      known,
      roles,
      subject,
      findDeny: (role) => findHit(role.deny, segments, m),
      findAllow: (role) => findHit(role.allow, segments, m),
      describe: (rule) => routeRuleText(rule.info),
    });
    return { ...decision, rule: decision.rule?.info, path: '/' + segments.join('/') };
  };

  return {
    can,
    assert(roles, path, method = 'GET') {
      if (!can(roles, path, method)) throw new ForbiddenError(path, String(method).toUpperCase());
    },
    explain: explainRoute,
    roles: Object.keys(config.roles),
  };
}

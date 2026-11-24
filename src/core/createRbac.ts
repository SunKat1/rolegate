import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, dictionary } from '../shared/validate.js';
import { matches, toEntries, toIndex } from './rules.js';
import type { Entry, RuleIndex } from './rules.js';
import type { Context, Rbac, RbacConfig } from './types.js';

interface IndexedRole<C extends Context> {
  allow: RuleIndex<C>;
  deny: RuleIndex<C>;
}

/**
 * Builds the resource/action checker:
 *
 *   const rbac = createRbac({ roles: { editor: { allow: { posts: ['read', 'write'] } } } });
 *   rbac.can('editor', 'posts', 'write'); // true
 *
 * The config is checked here, so a typo throws on startup.
 */
export function createRbac<C extends Context = Context>(config: RbacConfig<C>): Rbac<C> {
  checkRolesObject(config?.roles);

  // flat lists for the shared role code (extends, deny wins)
  const definitions = dictionary<RoleDefinition<Entry<C>>>();
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: toEntries(role.allow, `allow of role "${name}"`),
      deny: toEntries(role.deny, `deny of role "${name}"`),
    };
  }

  // and back to "by resource" for fast checks
  const known = new Map<string, IndexedRole<C>>();
  for (const [name, role] of resolveRoles(definitions)) {
    known.set(name, { allow: toIndex(role.allow), deny: toIndex(role.deny) });
  }

  const can: Rbac<C>['can'] = (roles, resource, action, ctx) => {
    // so `when` never gets undefined
    const context = (ctx ?? {}) as C;
    return decide(
      pickRoles(known, roles),
      (role) => matches(role.deny, resource, action, context),
      (role) => matches(role.allow, resource, action, context),
    );
  };

  return {
    can,
    assert(roles, resource, action, ctx) {
      if (!can(roles, resource, action, ctx)) throw new ForbiddenError(resource, action);
    },
    roles: Object.keys(config.roles),
  };
}

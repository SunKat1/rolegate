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
 * The whole config is checked and resolved here, once. A typo in a role
 * name or a broken rule throws while the app is starting.
 */
export function createRbac<C extends Context = Context>(config: RbacConfig<C>): Rbac<C> {
  checkRolesObject(config?.roles);

  // Flatten "resource -> rules" into plain lists, so the shared role code
  // can handle extends and deny the same way it does for routes.
  const definitions = dictionary<RoleDefinition<Entry<C>>>();
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: toEntries(role.allow, `allow of role "${name}"`),
      deny: toEntries(role.deny, `deny of role "${name}"`),
    };
  }

  // Then group them back by resource for fast checks.
  const known = new Map<string, IndexedRole<C>>();
  for (const [name, role] of resolveRoles(definitions)) {
    known.set(name, { allow: toIndex(role.allow), deny: toIndex(role.deny) });
  }

  const can: Rbac<C>['can'] = (roles, resource, action, ctx) => {
    // Conditions always get an object, so `when: (c) => c.userId === ...` never crashes on undefined.
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

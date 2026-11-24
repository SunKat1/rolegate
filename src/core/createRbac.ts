import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, configError, dictionary, isObject } from '../shared/validate.js';
import type { Context, Rbac, RbacConfig, ResourceRules, Rule } from './types.js';

const ANY = '*';

/** A rule together with the resource it was written for. */
interface Entry<C extends Context> {
  resource: string;
  rule: Rule<C>;
}

/** After inheritance we index rules by resource so a check doesn't scan everything. */
type Index<C extends Context> = Map<string, Rule<C>[]>;

interface IndexedRole<C extends Context> {
  allow: Index<C>;
  deny: Index<C>;
}

function checkRule(rule: unknown, where: string): void {
  if (typeof rule === 'string') return;
  if (!isObject(rule) || typeof rule.action !== 'string') {
    configError(`a rule should be an action name or { action, when? } (${where})`);
  }
  if (rule.when !== undefined && typeof rule.when !== 'function') {
    configError(`"when" for action "${rule.action}" should be a function (${where})`);
  }
}

function toEntries<C extends Context>(rules: ResourceRules<C> | undefined, where: string): Entry<C>[] {
  if (rules === undefined) return [];
  if (!isObject(rules)) configError(`${where} should be an object like { posts: ['read'] }`);

  return Object.entries(rules).flatMap(([resource, list]) => {
    if (!Array.isArray(list)) configError(`rules for "${resource}" should be a list (${where})`);
    list.forEach((rule) => checkRule(rule, `${where}, resource "${resource}"`));
    return list.map((rule) => ({ resource, rule }));
  });
}

function toIndex<C extends Context>(entries: Entry<C>[]): Index<C> {
  const index: Index<C> = new Map();
  for (const { resource, rule } of entries) {
    const list = index.get(resource);
    if (list) list.push(rule);
    else index.set(resource, [rule]);
  }
  return index;
}

function matches<C extends Context>(index: Index<C>, resource: string, action: string, ctx: C): boolean {
  // Look at rules for this exact resource and at the "any resource" ones.
  const keys = resource === ANY ? [ANY] : [resource, ANY];
  for (const key of keys) {
    for (const rule of index.get(key) ?? []) {
      const name = typeof rule === 'string' ? rule : rule.action;
      if (name !== ANY && name !== action) continue;
      const when = typeof rule === 'string' ? undefined : rule.when;
      if (!when || when(ctx)) return true;
    }
  }
  return false;
}

/**
 * Builds the resource/action checker:
 *
 *   const rbac = createRbac({ roles: { editor: { allow: { posts: ['read', 'write'] } } } });
 *   rbac.can('editor', 'posts', 'write'); // true
 */
export function createRbac<C extends Context = Context>(config: RbacConfig<C>): Rbac<C> {
  // Turn the "resource -> rules" maps into flat lists so the shared role code
  // can handle extends/deny the same way it does for routes.
  checkRolesObject(config?.roles);
  const definitions = dictionary<RoleDefinition<Entry<C>>>();
  for (const [name, role] of Object.entries(config.roles)) {
    definitions[name] = {
      extends: role.extends,
      allow: toEntries(role.allow, `allow of role "${name}"`),
      deny: toEntries(role.deny, `deny of role "${name}"`),
    };
  }

  const known = new Map<string, IndexedRole<C>>();
  for (const [name, role] of resolveRoles(definitions)) {
    known.set(name, { allow: toIndex(role.allow), deny: toIndex(role.deny) });
  }

  const can: Rbac<C>['can'] = (roles, resource, action, ctx) => {
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

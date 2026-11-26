import { explain } from '../shared/decision.js';
import { ForbiddenError } from '../shared/errors.js';
import { decide, pickRoles, resolveRoles } from '../shared/roles.js';
import type { RoleDefinition } from '../shared/roles.js';
import { checkRolesObject, dictionary } from '../shared/validate.js';
import { buildFilter } from './filter.js';
import type { InferActions, InferContext } from './infer.js';
import { describeEntry, findMatch, ruleText, toEntries, toIndex } from './rules.js';
import type { Entry, RuleIndex } from './rules.js';
import { checkAgainstSchema, checkSchema } from './schema.js';
import type { Context, Rbac, RbacConfig, ResourceSchema, Rule } from './types.js';

interface IndexedRole<C extends Context> {
  allow: RuleIndex<C>;
  deny: RuleIndex<C>;
}

/** The loosest config shape, only used to infer types from what you wrote. */
interface InferableConfig {
  resources?: ResourceSchema;
  roles: Record<string, { extends?: readonly string[]; allow?: Record<string, readonly Rule<any>[]>; deny?: Record<string, readonly Rule<any>[]> }>;
}

/**
 * Builds the resource/action checker:
 *
 *   const rbac = createRbac({ roles: { editor: { allow: { posts: ['read', 'write'] } } } });
 *   rbac.can('editor', 'posts', 'write'); // true
 *
 * Resource and action names are read from the config, so a typo in can() is
 * a type error. The config is checked here too, so a typo in it throws on startup.
 */
export function createRbac<const T extends InferableConfig>(config: T): Rbac<InferContext<T>, InferActions<T>>;
/** The older form with the context type spelled out: `createRbac<Ctx>(config)`. Names stay plain strings. */
export function createRbac<C extends Context = Context>(config: RbacConfig<C>): Rbac<C>;
export function createRbac<C extends Context>(config: RbacConfig<C>): Rbac<C> {
  checkRolesObject(config?.roles);
  checkSchema(config.resources);

  // flat lists for the shared role code (extends, deny wins)
  const definitions = dictionary<RoleDefinition<Entry<C>>>();
  for (const [name, role] of Object.entries(config.roles)) {
    const allow = toEntries(role.allow, name, 'allow');
    const deny = toEntries(role.deny, name, 'deny');
    if (config.resources) for (const entry of [...allow, ...deny]) checkAgainstSchema(entry, config.resources);
    definitions[name] = { extends: role.extends, allow, deny };
  }

  // and back to "by resource" for fast checks
  const known = new Map<string, IndexedRole<C>>();
  for (const [name, role] of resolveRoles(definitions)) {
    known.set(name, { allow: toIndex(role.allow), deny: toIndex(role.deny) });
  }

  // so `when` never gets undefined
  const contextOf = (ctx: C | undefined) => (ctx ?? {}) as C;

  const can: Rbac<C>['can'] = (roles, resource, action, ctx) => {
    const context = contextOf(ctx);
    return decide(
      pickRoles(known, roles),
      (role) => findMatch(role.deny, resource, action, context) !== undefined,
      (role) => findMatch(role.allow, resource, action, context) !== undefined,
    );
  };

  return {
    can,
    assert(roles, resource, action, ctx) {
      if (!can(roles, resource, action, ctx)) throw new ForbiddenError(resource, action);
    },
    explain(roles, resource, action, ctx) {
      const context = contextOf(ctx);
      const decision = explain({
        known,
        roles,
        subject: `${action} on ${resource}`,
        findDeny: (role) => findMatch(role.deny, resource, action, context),
        findAllow: (role) => findMatch(role.allow, resource, action, context),
        describe: (entry) => ruleText(describeEntry(entry)),
      });
      return { ...decision, rule: decision.rule && describeEntry(decision.rule) };
    },
    filter(roles, resource, action, ctx) {
      return buildFilter(pickRoles(known, roles), resource, action, ctx ?? {});
    },
    roles: Object.keys(config.roles),
  };
}

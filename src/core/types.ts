import type { Roles } from '../shared/roles.js';

/** Whatever extra data your conditions need, e.g. `{ userId, ownerId }`. */
export type Context = Record<string, unknown>;

/** Return true to let the rule apply. Gets `{}` when no context was passed. */
export type Condition<C extends Context = Context> = (ctx: C) => boolean;

/** Either just an action name, or an action that only counts when a condition holds. */
export type Rule<C extends Context = Context> =
  | string
  | { action: string; when?: Condition<C> };

/** Resource name -> rules for it. `'*'` works both as "any resource" and "any action". */
export type ResourceRules<C extends Context = Context> = Record<string, Rule<C>[]>;

export interface RoleConfig<C extends Context = Context> {
  /** Take everything these roles have, then add (or deny) on top. */
  extends?: string[];
  allow?: ResourceRules<C>;
  /** Wins over any allow, including the ones inherited through `extends`. */
  deny?: ResourceRules<C>;
}

export interface RbacConfig<C extends Context = Context> {
  roles: Record<string, RoleConfig<C>>;
}

export interface Rbac<C extends Context = Context> {
  /** Can these roles do `action` on `resource`? */
  can(roles: Roles, resource: string, action: string, ctx?: C): boolean;
  /** Same question, but throws ForbiddenError when the answer is no. */
  assert(roles: Roles, resource: string, action: string, ctx?: C): void;
  /** Every role name from the config. */
  readonly roles: readonly string[];
}

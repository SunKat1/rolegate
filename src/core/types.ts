import type { Decision } from '../shared/decision.js';
import type { Roles } from '../shared/roles.js';
import type { Filter } from '../filters/filter.js';
import type { Where } from './conditions/where.js';

/** Whatever extra data your conditions need, e.g. `{ userId, ownerId }`. */
export type Context = Record<string, unknown>;

/** Return true to let the rule apply. Gets `{}` when no context was passed. */
export type Condition<C extends Context = Context> = (ctx: C) => boolean;

/**
 * A function, or a plain object like `{ authorId: { ref: 'userId' } }`.
 * Objects can live in a database and be turned into query filters, functions can't.
 */
export type When<C extends Context = Context> = Condition<C> | Where;

/** Either just an action name, or an action that only counts when a condition holds. */
export type Rule<C extends Context = Context> =
  | string
  | { action: string; when?: When<C> };

/** Resource name -> rules for it. `'*'` works both as "any resource" and "any action". */
export type ResourceRules<C extends Context = Context> = Record<string, readonly Rule<C>[]>;

export interface RoleConfig<C extends Context = Context> {
  /** Take everything these roles have, then add (or deny) on top. */
  extends?: readonly string[];
  allow?: ResourceRules<C>;
  /** Wins over any allow, including the ones inherited through `extends`. */
  deny?: ResourceRules<C>;
}

/**
 * Every resource and its actions: `{ posts: ['read', 'write'] }`.
 * Optional. When it's there, a rule that names anything else throws on startup,
 * and can() only accepts these names in TypeScript.
 */
export type ResourceSchema = Readonly<Record<string, readonly string[]>>;

export interface RbacConfig<C extends Context = Context> {
  resources?: ResourceSchema;
  roles: Record<string, RoleConfig<C>>;
}

/** Resource name -> the union of its action names. With a loose config, it's string -> string. */
export type ActionMap = Record<string, string>;

/** The rule that decided, as explain() reports it. */
export interface RuleInfo {
  effect: 'allow' | 'deny';
  /** The role the rule is written in. With `extends`, that's the parent. */
  role: string;
  resource: string;
  action: string;
  condition: 'none' | 'function' | 'object';
}

export interface Rbac<C extends Context = Context, A extends ActionMap = ActionMap> {
  /** Can these roles do `action` on `resource`? */
  can<R extends keyof A & string>(roles: Roles, resource: R, action: A[R], ctx?: C): boolean;
  /** Same question, but throws ForbiddenError when the answer is no. */
  assert<R extends keyof A & string>(roles: Roles, resource: R, action: A[R], ctx?: C): void;
  /** Same answer as can(), plus which role and rule decided it. */
  explain<R extends keyof A & string>(roles: Roles, resource: R, action: A[R], ctx?: C): Decision<RuleInfo>;
  /**
   * Which records these roles may do `action` on, as a filter for your database.
   * Context keys you pass are filled in, the other fields become column checks.
   * Throws if a rule that matters has a function condition, since that can't be turned into a query.
   */
  filter<R extends keyof A & string>(roles: Roles, resource: R, action: A[R], ctx?: Partial<C>): Filter;
  /** Every role name from the config. */
  readonly roles: readonly string[];
}

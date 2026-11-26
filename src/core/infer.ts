// Type-level only: reads resource and action names out of a config written
// inline, so `rbac.can(roles, 'psts', 'read')` is a compile error.
//
// Whenever the config can't tell us the full list of names, this falls back to
// plain `string` and nothing gets in the way. That happens when the config is a
// plain `RbacConfig` (say, it came from JSON), when some role has `'*'` as a
// resource, or when a resource has `'*'` as an action. Declare `resources`
// to get strict names in those cases too.

import type { ActionMap, Context, ResourceSchema } from './types.js';

type ANY = '*';

/** The `allow` and `deny` maps of every role, as a union. */
type RuleMaps<T> = T extends { roles: infer Roles }
  ? Roles[keyof Roles] extends infer Role
    ? Role extends unknown
      ? // `?:` so a loose RoleConfig, where both are optional, still gets read
        NonNullable<(Role extends { allow?: infer A } ? A : never) | (Role extends { deny?: infer D } ? D : never)>
      : never
    : never
  : never;

type ActionName<R> = R extends string ? R : R extends { action: infer N extends string } ? N : never;

type RulesFor<M, K> = M extends unknown ? (K extends keyof M ? M[K] : never) : never;
type ActionsIn<L> = L extends readonly (infer R)[] ? ActionName<R> : never;

type AllKeys<M> = M extends unknown ? keyof M & string : never;
type ResourceNames<M> = Exclude<AllKeys<M>, ANY>;

/** Actions named for this resource. `posts: ['*']` grants any action, so then any name is fine. */
type ActionsOf<M, K> = ANY extends ActionsIn<RulesFor<M, K>> ? string : ActionsIn<RulesFor<M, K>>;

type FromRules<M> = { [K in ResourceNames<M>]: ActionsOf<M, K> };
type FromSchema<S extends ResourceSchema> = { [K in keyof S & string]: S[K][number] };

/** With `resources` in the config we trust it, otherwise we read the rules. */
export type InferActions<T> = T extends { resources: infer S extends ResourceSchema }
  ? FromSchema<S>
  : string extends ResourceNames<RuleMaps<T>>
    ? ActionMap
    : // admin: { allow: { '*': ['*'] } } covers resources nobody named, so we can't list them
      ANY extends AllKeys<RuleMaps<T>>
      ? ActionMap
      : FromRules<RuleMaps<T>>;

// ---- context ----

type Whens<T> = RuleMaps<T> extends infer M
  ? M extends unknown
    ? M[keyof M] extends infer L
      ? L extends readonly (infer R)[]
        ? R extends { when: infer W }
          ? W
          : never
        : never
      : never
    : never
  : never;

type Params<W> = W extends (ctx: infer P) => unknown ? P : never;
type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type IsAny<T> = 0 extends 1 & T ? true : false;

/** The context type the function conditions ask for. Context if there are none. */
export type InferContext<T> =
  Intersect<Params<Whens<T>>> extends infer C
    ? [C] extends [never]
      ? Context
      : IsAny<C> extends true
        ? Context
        : unknown extends C
          ? Context
          : C & Context
    : Context;

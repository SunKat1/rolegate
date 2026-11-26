// Small pieces every framework binding needs: where roles come from,
// what "not signed in" means, and checkers that can be swapped at runtime.

import { roleNames } from './roles.js';
import type { Roles } from './roles.js';

/**
 * Either the checker itself, or a function that returns the current one.
 * Pass a function when permissions can change while the app runs (say, they
 * live in a database): rebuild the checker, and the middleware picks it up
 * on the next request without re-mounting anything.
 */
export type Source<T> = T | (() => T);

export function read<T extends object>(source: Source<T>): T {
  return typeof source === 'function' ? (source as () => T)() : source;
}

/** What most auth libraries put on the request: `user.roles` or `user.role`. */
export interface UserLike {
  role?: string;
  roles?: readonly string[];
}

export function rolesOfUser(user: unknown): Roles {
  const u = user as UserLike | null | undefined;
  return u?.roles ?? u?.role;
}

/** No usable role name means not signed in, so `['']` or `[null]` is a 401 too. */
export function hasNoRoles(roles: Roles): boolean {
  return roleNames(roles).length === 0;
}

/** ['options'] -> Set { 'OPTIONS' }, for skipMethods. */
export function upperSet(methods: readonly string[] | undefined): Set<string> {
  return new Set((methods ?? []).map((m) => m.toUpperCase()));
}

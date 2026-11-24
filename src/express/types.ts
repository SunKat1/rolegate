import { roleNames } from '../shared/roles.js';
import type { Roles } from '../shared/roles.js';

/**
 * Bare-minimum shapes of req/res, so rolegate doesn't have to depend on Express.
 *
 * No index signature here on purpose: Express's `Request` is an interface
 * without one, and adding it would make a real Request not fit these types.
 */
export interface RequestLike {
  user?: { role?: string; roles?: string[] } | null;
  method?: string;
  path?: string;
  baseUrl?: string;
}

export interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): unknown;
}

export type NextLike = (err?: unknown) => void;

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

/** By default we expect your auth middleware to put roles on req.user. */
export function defaultGetRoles(req: unknown): Roles {
  const user = (req as RequestLike).user;
  return user?.roles ?? user?.role;
}

/** No usable role name means not signed in, so `['']` or `[null]` is a 401 too. */
export function hasNoRoles(roles: Roles): boolean {
  return roleNames(roles).length === 0;
}

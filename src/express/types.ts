import { rolesOfUser } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

export { read, hasNoRoles } from '../shared/adapter.js';
export type { Source } from '../shared/adapter.js';

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

/** By default we expect your auth middleware to put roles on req.user. */
export function defaultGetRoles(req: unknown): Roles {
  return rolesOfUser((req as RequestLike).user);
}

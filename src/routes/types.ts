import type { Roles } from '../shared/roles.js';

/**
 * A route a role may (or may not) open.
 *
 * - A string, e.g. '/dashboard' or '/admin/*': any HTTP method. That's all
 *   you need for frontend pages.
 * - An object with `methods`, e.g. `{ path: '/posts/:id', methods: ['PUT', 'DELETE'] }`,
 *   when you care about the method, which mostly happens with API routes.
 */
export type RouteRule = string | { path: string; methods?: readonly string[] };

export interface RouteRoleConfig {
  /** Take all routes of these roles, then add (or deny) on top. */
  extends?: string[];
  allow?: RouteRule[];
  /** Wins over any allow, including inherited ones. */
  deny?: RouteRule[];
}

export interface RouteAccessConfig {
  roles: Record<string, RouteRoleConfig>;
}

export interface RouteAccess {
  /**
   * Can these roles open `path`? `method` defaults to GET, which is what
   * "open a page" means. HEAD is checked as GET, same as Express handles it.
   */
  can(roles: Roles, path: string, method?: string): boolean;
  /** Same question, but throws ForbiddenError when the answer is no. */
  assert(roles: Roles, path: string, method?: string): void;
  /** Every role name from the config. */
  readonly roles: readonly string[];
}

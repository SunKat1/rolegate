import type { Decision, DecisionReason } from '../shared/decision.js';
import type { Roles } from '../shared/roles.js';
import type { RouteRuleInfo } from './rules.js';

/** explain() for routes: also says how the path was read, and can fail on a path that can't be decoded. */
export interface RouteDecision extends Omit<Decision<RouteRuleInfo>, 'reason'> {
  reason: DecisionReason | 'bad-path';
  /** The path as the checks saw it, e.g. "/posts/42" for "/Posts/./42/?tab=1". */
  path: string;
}

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
  extends?: readonly string[];
  allow?: readonly RouteRule[];
  /** Wins over any allow, including inherited ones. */
  deny?: readonly RouteRule[];
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
  /** Same answer as can(), plus which role and rule decided it. */
  explain(roles: Roles, path: string, method?: string): RouteDecision;
  /** Every role name from the config. */
  readonly roles: readonly string[];
}

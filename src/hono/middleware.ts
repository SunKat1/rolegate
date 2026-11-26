import type { ActionMap, Context, Rbac } from '../core/types.js';
import type { RouteAccess } from '../routes/types.js';
import { hasNoRoles, read, rolesOfUser, upperSet } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

/**
 * The bits of Hono's Context we use, so rolegate doesn't depend on Hono.
 * A real Hono Context fits it.
 */
export interface HonoContextLike {
  req: { method: string; path: string };
  get(key: string): unknown;
  json(body: unknown, status?: number): Response;
}

export type HonoNext = () => Promise<void>;

/** By default we look at the `user` variable, set by your auth middleware with c.set('user', ...). */
const defaultGetRoles = (c: HonoContextLike): Roles => rolesOfUser(c.get('user'));

export interface RequirePermissionOptions<C extends Context, Ctx extends HonoContextLike> {
  /** Where to get the user's roles. Default: c.get('user').roles, then .role. */
  getRoles?: (c: Ctx) => Roles | Promise<Roles>;
  /** Data for conditional rules. Can be async. */
  getContext?: (c: Ctx) => C | undefined | Promise<C | undefined>;
}

/**
 * Middleware for one action on one resource:
 *
 *   app.delete('/posts/:id', requirePermission(rbac, 'posts', 'delete'), handler);
 */
export function requirePermission<
  C extends Context,
  A extends ActionMap,
  R extends keyof A & string,
  Ctx extends HonoContextLike = HonoContextLike,
>(rbac: Source<Rbac<C, A>>, resource: R, action: A[R], options: RequirePermissionOptions<C, Ctx> = {}) {
  const getRoles = options.getRoles ?? defaultGetRoles;

  return async (c: Ctx, next: HonoNext): Promise<Response | void> => {
    const roles = await getRoles(c);
    if (hasNoRoles(roles)) return c.json({ error: 'Unauthorized' }, 401);
    if (!read(rbac).can(roles, resource, action, await options.getContext?.(c))) {
      return c.json({ error: 'Forbidden', resource, action }, 403);
    }
    await next();
  };
}

export interface GuardRoutesOptions<Ctx extends HonoContextLike> {
  getRoles?: (c: Ctx) => Roles | Promise<Roles>;
  /** Which path to check. Default: c.req.path, the full path even inside app.route(). */
  getPath?: (c: Ctx) => string;
  /** Methods to let through without a check, e.g. `['OPTIONS']` for CORS preflights. */
  skipMethods?: readonly string[];
}

/**
 * One middleware for many routes, driven by route rules:
 *
 *   app.use('/api/*', guardRoutes(apiAccess));
 */
export function guardRoutes<Ctx extends HonoContextLike = HonoContextLike>(
  access: Source<RouteAccess>,
  options: GuardRoutesOptions<Ctx> = {},
) {
  const getRoles = options.getRoles ?? defaultGetRoles;
  const getPath = options.getPath ?? ((c: Ctx) => c.req.path);
  const skip = upperSet(options.skipMethods);

  return async (c: Ctx, next: HonoNext): Promise<Response | void> => {
    if (!skip.has(c.req.method.toUpperCase())) {
      const roles = await getRoles(c);
      if (hasNoRoles(roles)) return c.json({ error: 'Unauthorized' }, 401);

      const path = getPath(c);
      if (!read(access).can(roles, path, c.req.method)) {
        return c.json({ error: 'Forbidden', path, method: c.req.method }, 403);
      }
    }
    await next();
  };
}

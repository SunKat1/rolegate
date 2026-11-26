import type { ActionMap, Context, Rbac } from '../core/types.js';
import type { RouteAccess } from '../routes/types.js';
import { hasNoRoles, read, upperSet } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';
import { defaultGetRoles } from './types.js';
import type { FastifyReplyLike, FastifyRequestLike } from './types.js';

export interface RequirePermissionOptions<C extends Context, Req extends FastifyRequestLike> {
  /** Where to get the user's roles. Default: request.user.roles, then request.user.role. */
  getRoles?: (req: Req) => Roles | Promise<Roles>;
  /** Data for conditional rules. Can be async, so it can load the record first. */
  getContext?: (req: Req) => C | undefined | Promise<C | undefined>;
}

/**
 * A preHandler for one action on one resource:
 *
 *   app.delete('/posts/:id', { preHandler: requirePermission(rbac, 'posts', 'delete') }, handler);
 *
 * preHandler runs after the body is parsed, so getContext can use params and body.
 */
export function requirePermission<
  C extends Context,
  A extends ActionMap,
  R extends keyof A & string,
  Req extends FastifyRequestLike = FastifyRequestLike,
>(rbac: Source<Rbac<C, A>>, resource: R, action: A[R], options: RequirePermissionOptions<C, Req> = {}) {
  const getRoles = options.getRoles ?? defaultGetRoles;

  return async (req: Req, reply: FastifyReplyLike): Promise<FastifyReplyLike | undefined> => {
    const roles = await getRoles(req);
    if (hasNoRoles(roles)) {
      // an async hook that answers has to return the reply, or Fastify runs the handler anyway
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (!read(rbac).can(roles, resource, action, await options.getContext?.(req))) {
      return reply.code(403).send({ error: 'Forbidden', resource, action });
    }
    return undefined;
  };
}

export interface GuardRoutesOptions<Req extends FastifyRequestLike> {
  /** Where to get the user's roles. Default: request.user.roles, then request.user.role. */
  getRoles?: (req: Req) => Roles | Promise<Roles>;
  /** Which path to check. Default: request.url (the query string is ignored). */
  getPath?: (req: Req) => string;
  /** Methods to let through without a check, e.g. `['OPTIONS']` for CORS preflights. */
  skipMethods?: readonly string[];
}

/**
 * One hook for many routes, driven by route rules:
 *
 *   app.addHook('preHandler', guardRoutes(apiAccess));
 *
 * Use 'preHandler' (or 'onRequest' if your auth runs there too) so that
 * request.user is already set when the guard looks at it.
 */
export function guardRoutes<Req extends FastifyRequestLike = FastifyRequestLike>(
  access: Source<RouteAccess>,
  options: GuardRoutesOptions<Req> = {},
) {
  const getRoles = options.getRoles ?? defaultGetRoles;
  const getPath = options.getPath ?? ((req: Req) => req.url);
  const skip = upperSet(options.skipMethods);

  return async (req: Req, reply: FastifyReplyLike): Promise<FastifyReplyLike | undefined> => {
    if (skip.has(req.method.toUpperCase())) return undefined;

    const roles = await getRoles(req);
    if (hasNoRoles(roles)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const path = getPath(req);
    if (!read(access).can(roles, path, req.method)) {
      return reply.code(403).send({ error: 'Forbidden', path, method: req.method });
    }
    return undefined;
  };
}

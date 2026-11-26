import { upperSet } from '../shared/adapter.js';
import type { RouteAccess } from '../routes/types.js';
import type { Roles } from '../shared/roles.js';
import { defaultGetRoles, hasNoRoles, read } from './types.js';
import type { NextLike, RequestLike, ResponseLike, Source } from './types.js';

export interface GuardRoutesOptions<Req = RequestLike> {
  /** Where to get the user's roles. Default: req.user.roles, then req.user.role. */
  getRoles?: (req: Req) => Roles;
  /**
   * Which path to check. By default it's `req.baseUrl + req.path`, the full
   * path even when the guard sits inside a router mounted at '/api'.
   * The query string isn't part of it.
   */
  getPath?: (req: Req) => string;
  /**
   * Methods to let through without a check, e.g. `['OPTIONS']` for CORS preflights
   * (they come without a token). Empty by default. Putting `cors()` above the guard works too.
   */
  skipMethods?: readonly string[];
}

function defaultGetPath(req: unknown): string {
  const { baseUrl = '', path = '/' } = req as RequestLike;
  return baseUrl + path;
}

/**
 * One middleware for many routes. It looks at the method and path of each
 * request and checks them against your route rules:
 *
 *   app.use('/api', guardRoutes(apiAccess));
 *
 * Sends 401 when the user has no roles and 403 when the route isn't allowed.
 *
 * It runs before Express has picked a route, so it checks the real path
 * ("/api/posts/42") against your patterns ("/api/posts/:id"). Public routes
 * like login go above it, or get allowed for a "guest" role (see the docs).
 */
export function guardRoutes<Req = RequestLike>(access: Source<RouteAccess>, options: GuardRoutesOptions<Req> = {}) {
  const getRoles = options.getRoles ?? defaultGetRoles;
  const getPath = options.getPath ?? defaultGetPath;
  const skip = upperSet(options.skipMethods);

  return (req: Req, res: ResponseLike, next: NextLike): void => {
    const method = (req as RequestLike).method ?? 'GET';
    if (skip.has(method.toUpperCase())) {
      next();
      return;
    }

    const roles = getRoles(req);
    if (hasNoRoles(roles)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const path = getPath(req);
    if (!read(access).can(roles, path, method)) {
      res.status(403).json({ error: 'Forbidden', path, method });
      return;
    }
    next();
  };
}

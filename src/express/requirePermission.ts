import type { ActionMap, Context, Rbac } from '../core/types.js';
import type { Roles } from '../shared/roles.js';
import { defaultGetRoles, hasNoRoles, read } from './types.js';
import type { NextLike, RequestLike, ResponseLike, Source } from './types.js';

export interface RequirePermissionOptions<C extends Context = Context, Req = RequestLike> {
  /** Where to get the user's roles. Default: req.user.roles, then req.user.role. */
  getRoles?: (req: Req) => Roles;
  /** Data for conditional rules, e.g. who owns the post. */
  getContext?: (req: Req) => C | undefined;
}

/**
 * Checks one fixed action on one resource:
 *
 *   app.delete('/posts/:id', requirePermission(rbac, 'posts', 'delete'), handler);
 *
 * Sends 401 when the user has no roles and 403 when the action isn't allowed.
 *
 * `Req` gets inferred from `getRoles` / `getContext` once you annotate them,
 * e.g. `getContext: (req: express.Request) => ({ ... })`.
 */
export function requirePermission<
  C extends Context = Context,
  A extends ActionMap = ActionMap,
  R extends keyof A & string = keyof A & string,
  Req = RequestLike,
>(rbac: Source<Rbac<C, A>>, resource: R, action: A[R], options: RequirePermissionOptions<C, Req> = {}) {
  const getRoles = options.getRoles ?? defaultGetRoles;

  return (req: Req, res: ResponseLike, next: NextLike): void => {
    const roles = getRoles(req);
    if (hasNoRoles(roles)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!read(rbac).can(roles, resource, action, options.getContext?.(req))) {
      res.status(403).json({ error: 'Forbidden', resource, action });
      return;
    }
    next();
  };
}

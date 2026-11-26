import type { ActionMap, Context, Rbac } from '../core/types.js';
import { hasNoRoles, read } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

export interface WithPermissionOptions<C extends Context, Req extends Request, Extra extends unknown[]> {
  /** Where the user's roles come from: your session, a JWT, `auth()` from your auth library. */
  getRoles: (req: Req) => Roles | Promise<Roles>;
  /** Data for conditional rules. Can be async, so it can load the record. */
  getContext?: (req: Req, ...extra: Extra) => C | undefined | Promise<C | undefined>;
}

/**
 * Wraps a Route Handler so it runs only when the action is allowed:
 *
 *   // app/api/posts/[id]/route.ts
 *   export const DELETE = withPermission(rbac, 'posts', 'delete', { getRoles }, async (req, { params }) => {
 *     ...
 *   });
 *
 * Answers 401 without roles and 403 without permission. Anything after `req`
 * (like Next's `{ params }`) is passed through to getContext and the handler.
 */
export function withPermission<
  C extends Context,
  A extends ActionMap,
  R extends keyof A & string,
  Req extends Request,
  Extra extends unknown[],
>(
  rbac: Source<Rbac<C, A>>,
  resource: R,
  action: A[R],
  options: WithPermissionOptions<C, Req, Extra>,
  handler: (req: Req, ...extra: Extra) => Response | Promise<Response>,
) {
  return async (req: Req, ...extra: Extra): Promise<Response> => {
    const roles = await options.getRoles(req);
    if (hasNoRoles(roles)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await options.getContext?.(req, ...extra);
    if (!read(rbac).can(roles, resource, action, ctx)) {
      return Response.json({ error: 'Forbidden', resource, action }, { status: 403 });
    }
    return handler(req, ...extra);
  };
}

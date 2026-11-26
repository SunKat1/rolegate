import type { ActionMap, Context, Rbac } from '../core/types.js';
import type { RouteAccess } from '../routes/types.js';
import { hasNoRoles, read, rolesOfUser } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

/** The part of Nest's ExecutionContext we use. The real one fits it. */
export interface ExecutionContextLike {
  getHandler(): Function;
  getClass(): Function;
  switchToHttp(): { getRequest<T = unknown>(): T };
}

/** Works for Nest on Express (originalUrl) and on Fastify (url). */
interface HttpRequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
  user?: unknown;
}

export interface NestGuardOptions<C extends Context, A extends ActionMap> {
  /** Checks for the @Permission() decorator. */
  rbac?: Source<Rbac<C, A>>;
  /** Checks every request's method and path against route rules. */
  access?: Source<RouteAccess>;
  /** Where to get the user's roles. Default: req.user.roles, then req.user.role (what Passport sets). */
  getRoles?: (req: any) => Roles | Promise<Roles>;
  /**
   * What to throw instead of returning false. Nest turns `false` into a 403,
   * so for a proper 401 pass `{ unauthorized: () => new UnauthorizedException() }`.
   */
  errors?: { unauthorized?: () => unknown; forbidden?: () => unknown };
}

interface Requirement<C extends Context> {
  resource: string;
  action: string;
  getContext?: (req: any) => C | undefined | Promise<C | undefined>;
}

// Keyed by the method (or class) itself, so we need neither reflect-metadata nor
// Nest's Reflector. Shared by all guards, like Nest's own metadata: a second
// createNestGuard() sees the decorators made with the first one.
const requirements = new WeakMap<Function, Requirement<any>>();

export interface PermissionOptions<C extends Context> {
  /** Data for conditional rules, e.g. `(req) => ({ userId: req.user.id, authorId: req.params.authorId })`. */
  getContext?: (req: any) => C | undefined | Promise<C | undefined>;
}

/**
 * Makes a guard class and a matching @Permission() decorator:
 *
 *   export const { RolegateGuard, Permission } = createNestGuard({ rbac });
 *
 *   app.useGlobalGuards(new RolegateGuard());   // or @UseGuards(RolegateGuard)
 *
 *   @Delete(':id')
 *   @Permission('posts', 'delete')
 *   remove() { ... }
 *
 * Handlers without @Permission() pass, unless `access` is set: then every
 * request also has to fit the route rules.
 */
export function createNestGuard<C extends Context, A extends ActionMap>(options: NestGuardOptions<C, A>) {
  if (!options.rbac && !options.access) throw new Error('rolegate: createNestGuard needs `rbac`, `access`, or both');

  const getRoles = options.getRoles ?? ((req: HttpRequestLike) => rolesOfUser(req.user));

  /** Marks a handler, or a whole controller, as needing this action. */
  function Permission<R extends keyof A & string>(resource: R, action: A[R], permissionOptions: PermissionOptions<C> = {}) {
    const requirement: Requirement<C> = { resource, action, getContext: permissionOptions.getContext };

    // Works with both decorator flavours: TypeScript's legacy ones (what Nest uses)
    // call it with (prototype, key, descriptor) or (class), the standard ones with (value, context).
    return (target: any, _keyOrContext?: unknown, descriptor?: PropertyDescriptor): void => {
      const marked = typeof descriptor?.value === 'function' ? descriptor.value : target;
      if (typeof marked !== 'function') throw new Error('rolegate: @Permission() goes on a method or a class');
      requirements.set(marked, requirement);
    };
  }

  const refuse = (kind: 'unauthorized' | 'forbidden'): false => {
    const make = options.errors?.[kind];
    if (make) throw make();
    return false;
  };

  class RolegateGuard {
    async canActivate(context: ExecutionContextLike): Promise<boolean> {
      const need = requirements.get(context.getHandler()) ?? requirements.get(context.getClass());
      if (!need && !options.access) return true;

      const req = context.switchToHttp().getRequest<HttpRequestLike | undefined>();
      // not an HTTP call (say, a websocket) but something is required: we can't check it, so no
      if (!req) return refuse('forbidden');

      const roles = await getRoles(req);
      if (hasNoRoles(roles)) return refuse('unauthorized');

      if (options.access) {
        const path = req.originalUrl ?? req.url ?? '/';
        if (!read(options.access).can(roles, path, req.method ?? 'GET')) return refuse('forbidden');
      }
      if (need) {
        if (!options.rbac) throw new Error('rolegate: @Permission() is used, but createNestGuard got no `rbac`');
        const ctx = await need.getContext?.(req);
        // the names were checked by Permission()'s types already
        const rbac = read(options.rbac) as Rbac<C>;
        if (!rbac.can(roles, need.resource, need.action, ctx)) return refuse('forbidden');
      }
      return true;
    }
  }

  return { RolegateGuard, Permission };
}

import { TRPCError } from '@trpc/server';
import type { ActionMap, Context, Rbac } from '../core/types.js';
import { hasNoRoles, read, rolesOfUser } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

/** Anything with t.middleware(), which is what initTRPC...create() gives you. */
interface MiddlewareMaker {
  middleware: (fn: (opts: any) => Promise<any>) => any;
}

/** The ctx type of your tRPC instance, read from t.middleware(). */
type CtxOf<T extends MiddlewareMaker> = Parameters<Parameters<T['middleware']>[0]>[0] extends { ctx: infer X } ? X : any;

export interface RequirePermissionOptions<C extends Context, TCtx> {
  /** Where to get the user's roles. Default: ctx.user.roles, then ctx.user.role. */
  getRoles?: (ctx: TCtx) => Roles | Promise<Roles>;
  /**
   * Data for conditional rules. Gets the input as the validators before this
   * middleware left it, so put `.input()` first if you need it typed.
   */
  getContext?: (opts: { ctx: TCtx; input: unknown }) => C | undefined | Promise<C | undefined>;
}

/**
 * A tRPC middleware for one action on one resource:
 *
 *   const t = initTRPC.context<AppContext>().create();
 *   const deletePost = t.procedure
 *     .input(z.object({ id: z.string() }))
 *     .use(requirePermission(t, rbac, 'posts', 'delete'))
 *     .mutation(...);
 *
 * Throws TRPCError UNAUTHORIZED without roles and FORBIDDEN without permission,
 * so the client gets the usual tRPC error codes.
 */
export function requirePermission<
  T extends MiddlewareMaker,
  C extends Context,
  A extends ActionMap,
  R extends keyof A & string,
>(t: T, rbac: Source<Rbac<C, A>>, resource: R, action: A[R], options: RequirePermissionOptions<C, CtxOf<T>> = {}): ReturnType<T['middleware']> {
  const getRoles = options.getRoles ?? ((ctx: CtxOf<T>) => rolesOfUser((ctx as { user?: unknown } | undefined)?.user));

  return t.middleware(async ({ ctx, input, next }: { ctx: CtxOf<T>; input: unknown; next: () => Promise<unknown> }) => {
    const roles = await getRoles(ctx);
    if (hasNoRoles(roles)) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const context = await options.getContext?.({ ctx, input });
    if (!read(rbac).can(roles, resource, action, context)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Forbidden: cannot ${action} ${resource}` });
    }
    return next();
  });
}

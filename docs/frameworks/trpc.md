# tRPC

`rolegate/trpc` gives you a middleware for one action on one resource. It throws `TRPCError` with `UNAUTHORIZED` or `FORBIDDEN`, so the client gets the usual tRPC error codes. That's also why this binding, unlike the others, imports `@trpc/server`. It's an optional peer dependency, already there in any tRPC project. Requires tRPC 11.

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createRbac } from 'rolegate';
import { requirePermission } from 'rolegate/trpc';

type AppContext = { user?: { id: number; roles: string[] } };
const t = initTRPC.context<AppContext>().create();

const rbac = createRbac({
  roles: {
    user: { allow: { posts: ['read', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    admin: { allow: { posts: ['read', 'delete'], users: ['manage'] } },
  },
});

export const appRouter = t.router({
  list: t.procedure
    .use(requirePermission(t, rbac, 'posts', 'read'))
    .query(() => db.post.findMany()),

  delete: t.procedure
    .input(z.object({ id: z.string() }))
    .use(
      requirePermission(t, rbac, 'posts', 'delete', {
        getContext: async ({ ctx, input }) => {
          const post = await db.post.find((input as { id: string }).id);
          return { userId: ctx.user?.id, authorId: post?.authorId };
        },
      }),
    )
    .mutation(({ input }) => db.post.delete(input.id)),
});
```

Pass `t` first. The middleware is made with your `t.middleware()`, so it fits your procedures and `ctx` is typed in `getRoles` and `getContext`.

Put `.input()` before `.use()` when `getContext` needs the input. It gets the input as the validators left it, typed as `unknown`, so cast it to your input type.

Roles are read from `ctx.user.roles`, then `ctx.user.role`. Anything else goes through `getRoles: (ctx) => ...`, which may be async.

## A reusable procedure

```ts
const adminProcedure = t.procedure.use(requirePermission(t, rbac, 'users', 'manage'));

export const adminRouter = t.router({
  ban: adminProcedure.input(z.object({ id: z.string() })).mutation(/* ... */),
});
```

## Lists

For "every post this user may edit", put [`rbac.filter()`](../filters.md) in the query instead of checking each row:

```ts
mine: t.procedure.query(({ ctx }) =>
  prisma.post.findMany({ where: toPrisma(rbac.filter(ctx.user?.roles, 'posts', 'delete', { userId: ctx.user?.id })) }),
),
```

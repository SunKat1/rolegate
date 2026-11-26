# Hono

`rolegate/hono` gives you two middlewares. Hono itself isn't a dependency, and they work on every runtime Hono runs on: Node, Bun, Deno and Cloudflare Workers.

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createRbac, createRouteAccess } from 'rolegate';
import { guardRoutes, requirePermission } from 'rolegate/hono';

type Env = { Variables: { user?: { id: number; roles: string[] } } };

const rbac = createRbac({
  roles: {
    user: { allow: { posts: ['read', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    admin: { allow: { posts: ['read', 'delete'] } },
  },
});

const app = new Hono<Env>();
app.use('*', yourAuth); // calls c.set('user', { id, roles })
```

## One action on one route

```ts
app.delete(
  '/posts/:id',
  requirePermission(rbac, 'posts', 'delete', {
    getContext: async (c: Context<Env>) => {
      const post = await db.post.find(c.req.param('id'));
      return { userId: c.get('user')?.id, authorId: post?.authorId };
    },
  }),
  (c) => c.body(null, 204),
);
```

Annotate `c` as `Context<Env>` in `getContext` and `getRoles` to get your variables typed.

## Many routes at once

```ts
const apiAccess = createRouteAccess({
  roles: {
    user: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    admin: { allow: ['/api/*'] },
  },
});

app.use('/api/*', guardRoutes(apiAccess));
app.route('/api', api);
```

The guard checks `c.req.path`, which is the full path even for routes mounted with `app.route()`.

## What it answers

- No roles: `401 { error: 'Unauthorized' }`
- Not allowed: `403 { error: 'Forbidden', ... }`
- Otherwise `next()`.

Roles are read from the `user` variable: `c.get('user').roles`, then `.role`. If your auth stores them elsewhere (a JWT payload from `hono/jwt` lives in `c.get('jwtPayload')`), pass `getRoles: (c) => c.get('jwtPayload')?.roles`. It may be async. For CORS, put `cors()` above the guard or pass `skipMethods: ['OPTIONS']`.

# Fastify

`rolegate/fastify` gives you two async hooks. Fastify itself isn't a dependency.

```ts
import Fastify from 'fastify';
import { createRbac, createRouteAccess } from 'rolegate';
import { guardRoutes, requirePermission } from 'rolegate/fastify';

const rbac = createRbac({
  roles: {
    user: { allow: { posts: ['read', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    admin: { allow: { posts: ['read', 'delete'] } },
  },
});

const app = Fastify();
app.register(yourAuthPlugin); // sets request.user, e.g. @fastify/jwt
```

## One action on one route

```ts
app.delete<{ Params: { id: string } }>(
  '/posts/:id',
  {
    preHandler: requirePermission(rbac, 'posts', 'delete', {
      // can be async, so it can load the post
      getContext: async (req) => {
        const post = await db.post.find(req.params.id);
        return { userId: req.user?.id, authorId: post?.authorId };
      },
    }),
  },
  handler,
);
```

It's a `preHandler`, so params and the body are parsed by the time `getContext` runs.

## Many routes at once

```ts
const apiAccess = createRouteAccess({
  roles: {
    user: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    admin: { allow: ['/api/*'] },
  },
});

app.addHook('preHandler', guardRoutes(apiAccess, { skipMethods: ['OPTIONS'] }));
```

The guard checks `request.url` (the query string is ignored) and the method against the route rules. Register it in a plugin with a prefix to cover only part of the app:

```ts
app.register(async (api) => {
  api.addHook('preHandler', guardRoutes(apiAccess));
  api.get('/posts/:id', getPost);
}, { prefix: '/api' });
```

`request.url` is the full URL, prefix included, so write the rules with `/api` in front.

## What it answers

- No roles: `401 { error: 'Unauthorized' }`
- Not allowed: `403 { error: 'Forbidden', resource, action }`, or `{ error: 'Forbidden', path, method }` for the guard
- Otherwise the request goes on.

Roles are read from `request.user.roles`, then `request.user.role`. That's what @fastify/jwt and most auth plugins set. Anything else goes through `getRoles: (req) => ...`, which may be async.

Pick the hook to fit your auth: if it runs in `onRequest`, the guard can run in `onRequest` too. It must come after the auth, or `request.user` isn't there yet.

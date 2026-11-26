# API routes

Use this when you'd like to protect a bunch of endpoints with **one** middleware instead of adding `requirePermission` to each route. The rules talk about paths and HTTP methods: "a reader can `GET /api/posts/*`, a writer can also `PUT /api/posts/:id`".

The patterns are the same as for [pages](pages.md#route-patterns): `/posts/:id`, `/admin/*`, `*`.

## Rules with methods

A plain string means "any method". Add `methods` to narrow it down:

```ts
// server/apiAccess.ts
import { createRouteAccess } from 'rolegate';

export const apiAccess = createRouteAccess({
  roles: {
    reader: {
      allow: [{ path: '/api/posts/*', methods: ['GET'] }],
    },
    writer: {
      extends: ['reader'],
      allow: [
        { path: '/api/posts', methods: ['POST'] },
        { path: '/api/posts/:id', methods: ['PUT', 'PATCH'] },
      ],
    },
    admin: {
      allow: ['/api/*'],
      deny: [{ path: '/api/posts/:id', methods: ['DELETE'] }], // even admins don't delete posts
    },
  },
});

apiAccess.can('reader', '/api/posts/1', 'GET'); // true
apiAccess.can('reader', '/api/posts/1', 'PUT'); // false
apiAccess.can('writer', '/api/posts/1', 'put'); // true, case doesn't matter
```

Some details worth knowing:

- If you leave out the method, it's `GET`.
- `HEAD` is checked as `GET`. Express runs GET handlers for HEAD requests, so otherwise HEAD would be a way around a GET deny.
- `methods: ['*']` is the same as not listing any methods.
- Paths are read the way a server reads them: `/api/posts/../admin` is checked as `/api/admin`. Details are on the [pages](pages.md#route-patterns) page.

## One guard for everything

```ts
import express from 'express';
import { guardRoutes } from 'rolegate/express';
import { apiAccess } from './apiAccess.js';

const app = express();
app.use(authenticate); // your auth, sets req.user

// Public endpoints go above the guard
app.post('/api/login', login);

// Everything below goes through the guard
app.use('/api', guardRoutes(apiAccess));
app.get('/api/posts/:id', getPost);
app.put('/api/posts/:id', updatePost);
```

What the guard does on each request:

1. It takes the roles from `req.user.roles` (or `req.user.role`). No roles means `401`. Empty strings and `null`s in the list don't count, so `roles: ['']` is a `401` too.
2. It takes the method and the full path, `req.baseUrl + req.path`. So even inside `app.use('/api', ...)` it sees `/api/posts/1` and not just `/posts/1`.
3. If the route isn't allowed, it sends `403` with `{ error: 'Forbidden', path, method }`. Otherwise it calls `next()`.

Both can be changed:

```ts
guardRoutes(apiAccess, {
  getRoles: (req: Request) => req.session?.roles,
  getPath: (req: Request) => req.originalUrl, // the query string is ignored anyway
});
```

## Public endpoints

There are two ways to do it, pick whichever reads better in your code:

- **Mount them above the guard**, as in the example above. This is the simplest way.
- **Give unauthenticated users a `guest` role** and allow them what they need:

  ```ts
  const apiAccess = createRouteAccess({
    roles: {
      guest: { allow: [{ path: '/api/posts/*', methods: ['GET'] }, { path: '/api/login', methods: ['POST'] }] },
      user: { extends: ['guest'], allow: [/* ... */] },
    },
  });

  app.use(guardRoutes(apiAccess, { getRoles: (req: Request) => req.user?.roles ?? 'guest' }));
  ```

  With this setup the guard never sends `401`, since everyone has at least the `guest` role. Instead of 401 they get `403`.

## CORS

If the frontend is on another domain, the browser first sends a preflight `OPTIONS` request. It has no cookies or token, so the guard answers `401` and the real request never happens.

The simplest fix is to put `cors()` above the guard. It answers preflights itself:

```ts
app.use(cors({ origin: 'https://app.example.com', credentials: true }));
app.use('/api', guardRoutes(apiAccess));
```

Or let the guard skip them:

```ts
app.use('/api', guardRoutes(apiAccess, { skipMethods: ['OPTIONS'] }));
```

Nothing is skipped by default.

## Routes and actions together

The guard knows the path and method, but not your data. "Only the author can edit a post" can't be decided from the URL. A common split:

- `guardRoutes` keeps the rough boundaries: who can reach which part of the API at all.
- `rbac.assert()` inside the handler does the fine-grained check with a context. See [actions on resources](actions.md#conditions).

```ts
app.use('/api', guardRoutes(apiAccess)); // writers can reach PUT /api/posts/:id

app.put('/api/posts/:id', async (req, res, next) => {
  try {
    const post = await db.posts.find(req.params.id);
    rbac.assert(req.user?.roles, 'posts', 'update', { userId: req.user?.id, ownerId: post.authorId });
    // ...
  } catch (err) {
    next(err);
  }
});
```

## Other frameworks

The same `apiAccess` object works with every binding, only the mounting differs:

| Framework | One guard for the whole API |
| --- | --- |
| Express | `app.use('/api', guardRoutes(apiAccess))` from `rolegate/express` |
| Fastify | `app.addHook('preHandler', guardRoutes(apiAccess))` from `rolegate/fastify`, see [Fastify](frameworks/fastify.md) |
| Hono | `app.use('/api/*', guardRoutes(apiAccess))` from `rolegate/hono`, see [Hono](frameworks/hono.md) |
| Next.js | `guardRequest(apiAccess, { getRoles })` in middleware, see [Next.js](frameworks/nextjs.md) |
| NestJS | `createNestGuard({ access: apiAccess })`, see [NestJS](frameworks/nestjs.md) |

The Express guard works with anything that has `(req, res, next)`, `req.method`, `req.path` and `res.status().json()`. And `apiAccess.can(roles, path, method)` is a plain function, so you can call it from anywhere yourself.

## Why was it a 403?

`apiAccess.explain(roles, path, method)` gives the same answer as `can()` plus the role and rule that decided it. Log it when a request is refused, see [Explaining decisions](explain.md).

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

If your frontend lives on another domain, the browser sends a preflight `OPTIONS` request before the real one. It carries no cookies and no token, so the guard would answer `401` and the browser would never send the actual request.

The cleanest fix is to put `cors()` above the guard. It answers preflights itself and never passes them on:

```ts
app.use(cors({ origin: 'https://app.example.com', credentials: true }));
app.use('/api', guardRoutes(apiAccess));
```

If preflights have to reach the guard for some reason, tell it to let them through:

```ts
app.use('/api', guardRoutes(apiAccess, { skipMethods: ['OPTIONS'] }));
```

Nothing is skipped by default. Only list methods that your app never handles with real logic.

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

## Without Express

Express isn't a dependency. The guard works with anything that has `(req, res, next)`, `req.method`, `req.path` and `res.status().json()`. And `apiAccess.can(roles, path, method)` is a plain function, so you can call it from any framework yourself.

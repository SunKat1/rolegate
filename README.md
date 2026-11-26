# rolegate

Zero-dependency RBAC for TypeScript and JavaScript. You describe once who can do what, and the same rules protect your React UI, your API and your database queries.

- **Roles and permissions**: "can an editor delete posts?", with inheritance and conditions like "only their own posts".
- **Pages and API routes**: "can a user open `/admin/users`?", "can they `PUT /api/posts/42`?", with patterns like `/posts/:id` and `/admin/*`.
- **Database filters**: "which posts may this user edit?" as a Prisma `where` or a parameterized SQL condition.
- **Ready-made bindings** for React, Next.js, Express, Fastify, Hono, NestJS and tRPC.

```bash
npm install rolegate
```

No runtime dependencies. Under 5 KB min+gzip for the core, under 1 KB for each binding, and tree-shakeable. Works with `import` and `require`, in Node, Bun, Deno, edge runtimes and the browser.

## A quick taste

```ts
import { createRbac } from 'rolegate';

export const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    author: {
      extends: ['viewer'],
      allow: { posts: ['create', { action: 'update', when: { authorId: { ref: 'userId' } } }] },
    },
  },
});

rbac.can('author', 'posts', 'update', { userId: 7, authorId: 7 }); // true
rbac.can('author', 'posts', 'update', { userId: 7, authorId: 8 }); // false
rbac.can('viewer', 'posts', 'create'); // false
rbac.can('author', 'psots', 'read'); // TypeScript error: there's no "psots" resource
```

The same object on the server:

```ts
import { requirePermission } from 'rolegate/express';

app.post('/posts', requirePermission(rbac, 'posts', 'create'), createPost);
```

In React:

```tsx
import { RbacProvider, Can } from 'rolegate/react';

<RbacProvider rbac={rbac} roles={user.roles}>
  <Can resource="posts" action="create"><NewPostButton /></Can>
</RbacProvider>;
```

And in the database:

```ts
import { toPrisma } from 'rolegate';

const editable = await prisma.post.findMany({
  where: toPrisma(rbac.filter(user.roles, 'posts', 'update', { userId: user.id })),
});
```

## What you get

- **Deny always wins**, including over rules a role inherits from another one.
- **Mistakes fail early.** Unknown roles, circular `extends`, broken route patterns and rules of the wrong shape throw when the config is created, not halfway through a request. That matters when rules come from JSON or a database.
- **Typos are type errors.** Resource and action names are read from the config.
- **Paths are read like a server reads them.** `/public/../admin`, `/public/%2e%2e/admin` and `/ADMIN` can't sneak past your route rules.
- **Missing data means no.** A condition like "author is the user" is false when either side is missing, so a forgotten context never opens anything up.
- **`explain()` tells you why.** "denied: role "blocked" denies * on *", with the role and the rule that decided it.

## Is it a good fit?

rolegate is for apps where permissions are **roles plus a few conditions**, and you'd like one place for them across the frontend, the backend and the database. A typical SaaS, an admin panel, a CMS, an internal tool.

| You want | rolegate | Look at instead |
| --- | --- | --- |
| Roles, inheritance, "only their own" | yes | |
| Pages and API routes guarded by path and method | yes, built in | |
| Rules editable by admins and stored in a database | yes, routes and object conditions | |
| "List what I can edit" as a query | yes, Prisma and SQL | |
| Roles per organization (multi-tenant) | yes, `rolesIn()` | |
| Permissions on individual fields of a record | no | [CASL](https://casl.js.org) |
| Conditions in MongoDB query syntax | no, plain equality and lists | CASL |
| One policy language shared with Go, Java, Python services | no | [Casbin](https://casbin.org) |
| Relationship-based access at scale ("editor of a folder that contains...") | no | [OpenFGA](https://openfga.dev), SpiceDB |

rolegate only decides. It doesn't log people in: you bring the authentication (Auth.js, Clerk, Passport, your own JWT) and pass the user's roles in.

## Docs

| I want to... | Read |
| --- | --- |
| Check actions like "edit a post", with roles and conditions | [Actions on resources](docs/actions.md) |
| Show or hide pages, menus and links by role | [Frontend pages](docs/pages.md) |
| Protect API endpoints by path and HTTP method | [API routes](docs/api-routes.md) |
| Keep permissions in a database and update them live | [Permissions from a database](docs/database.md) |
| Load only the records a user may see or edit | [Database filters](docs/filters.md) |
| Give people different roles in different organizations | [Organizations and teams](docs/organizations.md) |
| Find out why something was denied | [Explaining decisions](docs/explain.md) |
| Get typo-proof names, or use it from CommonJS | [TypeScript and module formats](docs/typescript.md) |

Framework guides: [Next.js](docs/frameworks/nextjs.md) · [Express](docs/api-routes.md) · [Fastify](docs/frameworks/fastify.md) · [Hono](docs/frameworks/hono.md) · [NestJS](docs/frameworks/nestjs.md) · [tRPC](docs/frameworks/trpc.md) · [React](docs/pages.md#react)

## Entry points

| Import from | What's there |
| --- | --- |
| `rolegate` | `createRbac`, `createRouteAccess`, `routeConfigFromRows`, `toPrisma`, `toSql`, `rolesIn`, `normalizePath`, `ForbiddenError` |
| `rolegate/react` | `RbacProvider`, `useCan`, `<Can>`, `RouteAccessProvider`, `useCanVisit`, `<CanVisit>` |
| `rolegate/next` | `guardRequest` (middleware), `withPermission` (Route Handlers) |
| `rolegate/express` | `requirePermission`, `guardRoutes` |
| `rolegate/fastify` | `requirePermission`, `guardRoutes` (hooks) |
| `rolegate/hono` | `requirePermission`, `guardRoutes` |
| `rolegate/nest` | `createNestGuard` (a guard plus a `@Permission()` decorator) |
| `rolegate/trpc` | `requirePermission` (middleware that throws `TRPCError`) |

None of the bindings depends on its framework, except `rolegate/trpc`, which imports `@trpc/server` (an optional peer dependency) because tRPC only understands its own errors.

## How a decision is made

The same rules apply everywhere:

| Situation | Result |
| --- | --- |
| Some role allows it and none deny it | allowed |
| Any role denies it | denied, even if another role allows it |
| A role `extends` another one | it gets all of that role's allows **and** denies |
| A condition is missing the data it needs | that rule doesn't apply |
| A role that isn't in the config, or no role at all | denied |
| A path with broken encoding, like `/posts/%zz` | denied |

## Development

```bash
npm install
npm test               # node:test via tsx; React in jsdom, Fastify, Hono and tRPC for real
npm run typecheck      # type-checks the sources and the tests
npm run build          # ES modules to dist/, CommonJS to dist/cjs/
npm run check:package  # loads every entry point of the build with import and require
```

Project layout:

```
src/
  shared/        used by both engines and all bindings
    roles.ts       role inheritance and the "deny wins" rule
    decision.ts    explain(): who decided and why
    validate.ts    config shape checks, the "__proto__" guard
    adapter.ts     bits every binding needs: roles from req.user, 401 vs 403
    errors.ts      ForbiddenError
  core/          createRbac: actions on resources
    createRbac.ts  the checker itself
    rules.ts       how resource rules are checked, indexed and matched
    conditions/    object conditions like { authorId: { ref: 'userId' } }
    filter.ts      rbac.filter(): rules turned into a database filter
    schema.ts      the optional `resources` list
    infer.ts       type-level: names read from the config
  routes/        createRouteAccess: pages and API routes
    matching/      how a path is read, and "/posts/:id"-style patterns
    rules.ts       compiling route rules, methods, HEAD as GET
    fromRows.ts    rows from a database -> config
  filters/       toPrisma and toSql
  scopes/        rolesIn: roles per organization
  express/ fastify/ hono/ next/ nest/ trpc/ react/   framework bindings
docs/            usage guides
scripts/         build and package checks
test/            same folders as src/, plus helpers/ for shared test utilities
```

## License

MIT

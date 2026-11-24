# rolegate

Tiny, dependency-free access control for TypeScript. You describe who can do what once, and the same rules work on the server, in Express and in React.

It answers two kinds of questions, and you can use either one on its own or both together:

- **Actions on things.** "Can an editor delete posts?" Roles, actions, inheritance, and conditions like "only their own posts".
- **Routes and pages.** "Can an editor open `/admin/users`?" "Can they `PUT /api/posts/42`?" Route patterns like `/posts/:id` and `/admin/*`, with rules you can keep in a database.

What you get either way:

- **Deny always wins**, including over rules a role inherits from another one.
- **Mistakes fail early.** Unknown roles, circular `extends` and broken route patterns throw when the config is created, not halfway through a request.
- **No runtime dependencies.** React is an optional peer dependency, and Express isn't needed at all.

```bash
npm install rolegate
```

The package is ESM only. In TypeScript, use `"moduleResolution": "nodenext"` or `"bundler"` so that `rolegate/express` and `rolegate/react` resolve.

## A quick taste

Actions on things:

```ts
import { createRbac } from 'rolegate';

const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
    admin: { allow: { '*': ['*'] } },
  },
});

rbac.can('editor', 'posts', 'write'); // true
rbac.can('viewer', 'posts', 'write'); // false
```

Pages:

```ts
import { createRouteAccess } from 'rolegate';

const pages = createRouteAccess({
  roles: {
    guest: { allow: ['/', '/login', '/posts/*'] },
    user: { extends: ['guest'], allow: ['/profile'] },
    admin: { extends: ['user'], allow: ['/admin/*'] },
  },
});

pages.can('user', '/posts/42'); // true
pages.can('user', '/admin/users'); // false
```

## Docs

Pick the page that matches what you're building:

| I want to... | Read |
| --- | --- |
| Check actions like "edit a post", with roles and conditions | [Actions on resources](docs/actions.md) |
| Show or hide frontend pages, menus and links by role | [Frontend pages](docs/pages.md) |
| Protect API endpoints by path and HTTP method | [API routes](docs/api-routes.md) |
| Keep route permissions in a database and update them live | [Permissions from a database](docs/database.md) |

## Which entry point has what

| Import from | What's there |
| --- | --- |
| `rolegate` | `createRbac`, `createRouteAccess`, `routeConfigFromRows`, `ForbiddenError` |
| `rolegate/express` | `requirePermission` (one action), `guardRoutes` (many routes at once) |
| `rolegate/react` | `RbacProvider`, `useCan`, `<Can>`, `RouteAccessProvider`, `useCanVisit`, `<CanVisit>` |

## How a decision is made

The same rules apply to both kinds of checks:

| Situation | Result |
| --- | --- |
| Some role allows it and none deny it | allowed |
| Any role denies it | denied, even if another role allows it |
| A role `extends` another one | it gets all of that role's allows **and** denies |
| A role that isn't in the config, or no role at all | denied |

## Development

```bash
npm install
npm test           # node:test via tsx, React tests run in jsdom
npm run typecheck  # type-checks the sources and the tests
npm run build      # compiles src/ to dist/ (tsconfig.build.json)
```

Project layout:

```
src/
  shared/        used by both engines
    roles.ts       role inheritance and the "deny wins" rule
    validate.ts    config shape checks, the "__proto__" guard
    errors.ts      ForbiddenError
  core/          createRbac: actions on resources
    createRbac.ts  the checker itself
    rules.ts       how resource rules are checked, indexed and matched
  routes/        createRouteAccess: pages and API routes
    matching/
      path.ts      how a request path is read: decoding, "..", case
      pattern.ts   "/posts/:id", "/admin/*" and friends
    rules.ts       compiling route rules, methods, HEAD as GET
    createRouteAccess.ts
    fromRows.ts    rows from a database -> config
  express/       requirePermission and guardRoutes
  react/         providers, hooks and components
docs/            usage guides
test/            same folders as src/, plus helpers/ for shared test utilities
```

## Status

Everything is covered by tests: the resource engine, route patterns and the route engine, loading rules from rows, both Express middlewares, and the React providers, hooks and components (Testing Library on top of jsdom).

## License

MIT

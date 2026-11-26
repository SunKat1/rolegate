# TypeScript and module formats

## Names you can't mistype

Write the config inline in `createRbac` and TypeScript reads the resource and action names out of it:

```ts
const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'], comments: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
  },
});

rbac.can(roles, 'posts', 'write'); // fine
rbac.can(roles, 'post', 'write'); // error: no resource "post"
rbac.can(roles, 'comments', 'write'); // error: comments only has "read"
```

The same goes for everything that takes the rbac: `requirePermission` in every binding, `@Permission()` in NestJS, `withPermission` in Next.js, and `useCan<typeof rbac>()` in React.

The context type is read from function conditions, so `when: (c: { userId?: number }) => ...` makes `{ userId: 'x' }` an error.

### When names fall back to strings

Sometimes the config simply doesn't contain the full list of names, and then any string is accepted, same as in older versions:

- some role has `'*'` as a **resource**, like `admin: { allow: { '*': ['*'] } }`. It covers resources nobody named, so TypeScript can't list them;
- a resource has `'*'` as an **action**, like `owner: { allow: { posts: ['*'] } }`. Then any action is fine for `posts`, while resource names are still checked;
- the config is a variable typed as `RbacConfig`, which is what you get from JSON or a database;
- the config is declared in a variable first without `as const`. Then TypeScript widens `['read']` to `string[]`. Pass it inline or add `as const`.

### Declaring the resources

Add a `resources` list to get strict names in all of these cases. It also checks the rules **at runtime**, which is what you want when they come from a database:

```ts
const rbac = createRbac({
  resources: {
    posts: ['read', 'write', 'delete'],
    billing: ['read', 'refund'],
  },
  roles: {
    viewer: { allow: { posts: ['read'] } },
    admin: { allow: { '*': ['*'] }, deny: { billing: ['refund'] } },
  },
});

rbac.can('admin', 'billing', 'refund'); // fine, it's in the list (and denied)
rbac.can('admin', 'invoices', 'read'); // type error
```

With `resources`, a rule for `psots` or an action `wirte` throws when the config is created. A rule for `'*'` is fine, but an action under `'*'` has to exist on at least one resource.

### The older form

`createRbac<Ctx>(config)` with the context type spelled out still works exactly as before. Names are plain strings in that form. To get both a typed context and typed names, type your condition functions instead: `when: (c: Ctx) => ...`.

## ESM and CommonJS

The package ships both:

```ts
import { createRbac } from 'rolegate'; // ES modules
const { createRbac } = require('rolegate'); // CommonJS, e.g. NestJS
```

Every entry point (`rolegate/express`, `rolegate/react`, ...) works both ways, and types resolve with any `moduleResolution`: `node16`/`nodenext`, `bundler`, and the older `node`.

One thing to avoid: loading rolegate both ways in the same process. Then there are two copies, and `err instanceof ForbiddenError` is false for an error from the other copy. Checking `err.name === 'ForbiddenError'` works in either case.

Requires TypeScript 5.0 or newer.

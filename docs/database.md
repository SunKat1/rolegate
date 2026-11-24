# Permissions from a database

Say you have a table of pages (or endpoints) and an admin screen where someone ticks which role can open what. rolegate doesn't talk to databases, but it's built so that wiring this up takes a few lines.

## A table that works well

Nothing forces you to use exactly this table, but it maps one to one:

```sql
CREATE TABLE route_permissions (
  role   text NOT NULL,              -- 'user', 'admin', ...
  path   text NOT NULL,              -- '/admin/*', '/posts/:id', ...
  method text,                       -- NULL = any method (all you need for pages)
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny'))
);
```

If you keep role inheritance in the database too, a second table like `role_parents(role, parent)` is enough.

## From rows to a config

`routeConfigFromRows` turns rows into a config for `createRouteAccess`:

```ts
import { createRouteAccess, routeConfigFromRows } from 'rolegate';

const rows = await db.query('SELECT role, path, method, effect FROM route_permissions');
const parents = await db.query('SELECT role, parent FROM role_parents');

const access = createRouteAccess(
  routeConfigFromRows(rows, {
    extends: groupBy(parents, (p) => p.role, (p) => p.parent), // { admin: ['user'], ... }
  }),
);
```

It expects rows shaped like `{ role, path, method?, effect? }`. If your columns are named differently, map them first:

```ts
routeConfigFromRows(rows.map((r) => ({ role: r.role_name, path: r.url, method: r.http_method })));
```

You don't have to use the helper. The config is a plain object, so you can build it however you like. The helper just saves you a loop.

## When the data is broken

`createRouteAccess` checks everything up front. If someone saves the pattern `admin/*` (without the leading slash), or a role extends one that doesn't exist, you get an error that names the role:

```
rolegate: bad route pattern "admin/*": it should start with "/" (or be just "*") (in role "editor")
```

The shape is checked too, since TypeScript can't see what's in your table. A `path` that isn't a string or a `method` that's a number throws right away.

The role name `__proto__` is refused. In a plain JS object that key swaps the prototype, and a row like that could hand its routes to every other role.

At startup that's exactly what you want. When you're reloading at runtime, though, you don't want one bad row to take the whole app down. So keep the old rules if the new ones don't build (see below). It's also a good idea to run the same check in the admin screen before saving: call `createRouteAccess` with the new data and show the error to the person who's editing.

## Updating the rules without a restart

### On the server

`createRouteAccess` returns an immutable object. To apply new rules, build a new one and swap the variable. Pass the middleware **a function** that returns the current object, not the object itself. That way it always uses the latest rules:

```ts
import { guardRoutes } from 'rolegate/express';

let access = await loadAccess();

async function loadAccess() {
  const rows = await db.query('SELECT role, path, method, effect FROM route_permissions');
  return createRouteAccess(routeConfigFromRows(rows));
}

async function refresh() {
  try {
    access = await loadAccess();
  } catch (err) {
    // Broken data in the DB: log it and keep working with the old rules
    console.error('Could not reload permissions, keeping the old ones', err);
  }
}

setInterval(refresh, 60_000); // or call refresh() right after the admin screen saves changes

app.use('/api', guardRoutes(() => access));
```

`requirePermission` accepts a function the same way: `requirePermission(() => rbac, 'posts', 'delete')`.

### On the frontend

Usually you fetch the rules once, after login, together with the user. Give the server an endpoint that returns rows (or a ready-made config) and build the object in the browser:

```tsx
import { useMemo } from 'react';
import { createRouteAccess, routeConfigFromRows } from 'rolegate';
import { RouteAccessProvider } from 'rolegate/react';

function AccessRoot({ children }) {
  const { user, routeRows } = useSession(); // however you load them

  const access = useMemo(
    () => createRouteAccess(routeConfigFromRows(routeRows ?? [])),
    [routeRows],
  );

  return (
    <RouteAccessProvider access={access} roles={user?.roles ?? 'guest'}>
      {children}
    </RouteAccessProvider>
  );
}
```

When `routeRows` changes, `access` is rebuilt and every `useCanVisit` and `<CanVisit>` re-renders with the new rules.

The client doesn't need everyone's rules. You can send only the rows for the user's roles, and it'll work just the same.

## What can't go in the database

Conditions like "only the post's author" are functions (`when` in [actions](actions.md#conditions)), and they live in code. A sensible split:

- **Database**: which pages and endpoints each role can reach at all. These are the things admins change.
- **Code**: rules that depend on data, like ownership, status or limits. These are the things developers change.

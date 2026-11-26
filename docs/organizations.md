# Organizations and teams

In a multi-tenant app a person can be an admin in their own company and a viewer in a client's. The rules ("an admin can delete invoices") are the same for every organization. Only the **roles** depend on where the user is.

So you keep one config and pick the right roles per request with `rolesIn()`:

```ts
import { createRbac, rolesIn } from 'rolegate';

const rbac = createRbac({
  roles: {
    viewer: { allow: { invoices: ['read'] } },
    admin: { extends: ['viewer'], allow: { invoices: ['create', 'delete'], members: ['invite'] } },
    support: { allow: { invoices: ['read'] } },
  },
});

const memberships = {
  'org-acme': ['admin'],
  'org-globex': 'viewer',
  '*': ['support'], // roles that count in every organization
};

rbac.can(rolesIn(memberships, 'org-acme'), 'invoices', 'delete'); // true
rbac.can(rolesIn(memberships, 'org-globex'), 'invoices', 'delete'); // false
rbac.can(rolesIn(memberships, 'org-unknown'), 'invoices', 'read'); // true, through support
```

Nothing leaks from one organization into another. An unknown or empty organization id gives only the `'*'` roles.

## Where memberships come from

`rolesIn()` takes whatever shape is handy:

```ts
// an object, e.g. from a JWT claim
rolesIn({ 'org-1': ['admin'], 'org-2': 'viewer' }, orgId);

// a Map
rolesIn(new Map([['org-1', ['admin']]]), orgId);

// rows from a memberships table
const rows = await db.query('SELECT org_id AS scope, role FROM memberships WHERE user_id = $1', [userId]);
rolesIn(rows, orgId);
```

Rows need `scope` and `role` fields. Alias your columns, or map them first.

## Wiring it in

The bindings take a `getRoles` option. That's the place to look up the organization:

```ts
// Express: the org id is in the URL
app.delete('/orgs/:orgId/invoices/:id', requirePermission(rbac, 'invoices', 'delete', {
  getRoles: (req: Request) => rolesIn(req.user?.memberships, req.params.orgId),
}), handler);

// one guard for everything: the org id comes in a header
app.use('/api', guardRoutes(apiAccess, {
  getRoles: (req: Request) => rolesIn(req.user?.memberships, req.get('x-org-id')),
}));
```

A guard mounted with `app.use()` runs before Express matches the route, so `req.params` is empty there. Take the organization from a header, a subdomain or the session, or use `requirePermission` on the route itself.

In React, pass the roles for the organization the user is looking at:

```tsx
<RbacProvider rbac={rbac} roles={rolesIn(me.memberships, currentOrgId)}>
```

## Make sure the record belongs to the organization

Roles answer "may this person delete invoices in Acme?". They don't check that invoice 42 **is** Acme's. Pass the organization to a condition, or filter by it in the query:

```ts
const rbac = createRbac({
  roles: {
    admin: { allow: { invoices: [{ action: 'delete', when: { orgId: { ref: 'currentOrgId' } } }] } },
  },
});

rbac.can(rolesIn(memberships, orgId), 'invoices', 'delete', { currentOrgId: orgId, orgId: invoice.orgId });
```

With the condition in place, [`rbac.filter()`](filters.md) adds `orgId = ...` to list queries for you.

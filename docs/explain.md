# Explaining decisions

"Why do I get a 403?" is the most common question about any permission setup. `explain()` gives the same answer as `can()`, plus who decided it and how.

```ts
const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
    blocked: { deny: { '*': ['*'] } },
  },
});

rbac.explain('editor', 'posts', 'read');
// {
//   allowed: true,
//   reason: 'allowed',
//   role: 'editor',                // the user's role that decided it
//   rule: { effect: 'allow', role: 'viewer', resource: 'posts', action: 'read', condition: 'none' },
//   unknownRoles: [],
//   message: 'allowed read on posts: role "viewer" allows read on posts',
// }

rbac.explain(['editor', 'blocked'], 'posts', 'write').message;
// 'denied write on posts: role "blocked" denies * on *'
```

`rule.role` is where the rule is written. With `extends` it's the parent role, so you know which part of the config to look at.

## Reasons

| `reason` | Means |
| --- | --- |
| `allowed` | some role allows it, and none denies it |
| `denied` | a deny rule matched. `rule` is that deny |
| `no-match` | the user has known roles, but no rule allows it (or its condition didn't hold) |
| `no-roles` | none of the user's roles are in the config, or there are no roles at all |
| `bad-path` | routes only: the path has broken encoding like `%zz` |

`unknownRoles` lists roles the user has that the config doesn't know. It's usually a typo (`Admin` vs `admin`) or a token issued before a role was renamed, and it's easy to miss otherwise.

## Routes

Route checkers have `explain()` too. They also report the path the way the check read it, which helps with trailing slashes, case and `..`:

```ts
pages.explain('user', '/Admin/./users/');
// { allowed: false, reason: 'no-match', path: '/admin/users', message: 'denied GET /admin/users: no rule of "user" allows it', ... }
```

For routes, `rule` looks like `{ effect, role, path: '/admin/*', methods: ['GET'] }`, with `methods: null` meaning any method.

## Logging refused requests

The bindings answer with a plain `403` and don't say why, since the reason is none of the client's business. Log it on your side when you need it:

```ts
app.use('/api', (req, res, next) => {
  const decision = apiAccess.explain(req.user?.roles, req.baseUrl + req.path, req.method);
  if (!decision.allowed) logger.info({ user: req.user?.id, ...decision }, decision.message);
  next();
});
app.use('/api', guardRoutes(apiAccess));
```

`explain()` costs a bit more than `can()`, since it builds the result object. That's fine for logs and debugging. Keep `can()` for the hot path.

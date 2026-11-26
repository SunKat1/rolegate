# Changelog

## 0.2.0 (2026-11-26)

Everything from 0.1 works as before. All of the below is opt-in.

### New

- **Framework bindings**: `rolegate/next` (middleware and Route Handlers), `rolegate/fastify`, `rolegate/hono`, `rolegate/nest` (a guard plus `@Permission()`) and `rolegate/trpc`. None of them depends on its framework, except tRPC, which needs `@trpc/server` as an optional peer dependency.
- **Object conditions**: `when: { authorId: { ref: 'userId' }, status: ['draft', 'review'] }`. They can be stored in a database and sent to the browser. Function conditions still work.
- **Database filters**: `rbac.filter()` returns "which records may this user touch", and `toPrisma()` / `toSql()` turn that into a query.
- **`explain()`** on both checkers: the same answer as `can()`, plus the role and rule that decided it, and unknown roles.
- **Roles per organization**: `rolesIn(memberships, orgId)`.
- **Typed names**: resource and action names are read from the config, so typos in `can()` are type errors. Configs with `'*'` resources, or from JSON, stay plain strings. An optional `resources` list makes names strict everywhere and checks the rules at startup.
- **CommonJS build** next to the ES modules. All entry points work with `require`, and types resolve with any `moduleResolution`, including the older `node`.

### Changed

- The error for a broken `when` now reads "should be a function or an object like ...", since objects are allowed.
- `requirePermission` in `rolegate/express` got more type parameters, so names are checked against your rbac. If you passed type arguments by hand, like `requirePermission<Ctx, Request>(...)`, annotate `getContext: (req: Request) => ...` instead.
- A typed rbac rejects resource or action names that appear nowhere in the config, unless some role has `'*'` as a resource. Such a check was always `false` at runtime, so this mostly catches typos.

## 0.1.1

- Fixes for route check bypasses, configs validated up front.

## 0.1.0

- First release: `createRbac`, `createRouteAccess`, `routeConfigFromRows`, Express and React bindings.

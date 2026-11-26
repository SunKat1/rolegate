# Database filters

`rbac.can()` answers for one record you already have. Lists need the opposite question: "which posts may this user edit?" Loading every post and calling `can()` on each one is slow and breaks pagination. `rbac.filter()` turns your rules into a condition for the query instead.

```ts
import { createRbac, toPrisma, toSql } from 'rolegate';

const rbac = createRbac({
  roles: {
    user: {
      allow: {
        posts: [
          { action: 'read', when: { status: 'published' } },
          { action: 'read', when: { authorId: { ref: 'userId' } } },
          { action: 'update', when: { authorId: { ref: 'userId' } } },
        ],
      },
    },
    moderator: { extends: ['user'], allow: { posts: ['read', 'update'] } },
  },
});

const filter = rbac.filter('user', 'posts', 'read', { userId: 7 });
// { or: [{ field: 'status', eq: 'published' }, { field: 'authorId', eq: 7 }] }
```

## With Prisma

```ts
const posts = await prisma.post.findMany({
  where: toPrisma(rbac.filter(user.roles, 'posts', 'read', { userId: user.id })),
});
// where: { OR: [{ status: 'published' }, { authorId: 7 }] }
```

Combine it with your own conditions through `AND`:

```ts
where: { AND: [toPrisma(rbac.filter(roles, 'posts', 'read', { userId })), { title: { contains: search } }] }
```

## With SQL

```ts
const { sql, params } = toSql(rbac.filter(user.roles, 'posts', 'read', { userId: user.id }));
const rows = await db.query(`SELECT * FROM posts WHERE ${sql}`, params);
// sql: ("status" = ? OR "authorId" = ?), params: ['published', 7]
```

Values always go into `params`, never into the SQL string. Column names come from your conditions, and those are checked when the config is created (letters, digits and `_` only), so they're safe to put in the query.

Options for other databases:

```ts
toSql(filter, { placeholder: (i) => `$${i}` }); // Postgres: $1, $2, ...
toSql(filter, { placeholder: (i) => `$${i}`, firstIndex: 3 }); // your query already uses $1 and $2
toSql(filter, { quote: (column) => `\`${column}\`` }); // MySQL backticks
```

If your columns are named differently from the fields in your conditions (`author_id` vs `authorId`), name the condition fields after the columns. The same names work in `can()`, as long as the context you pass uses them too.

## How it's worked out

It's the same decision as `can()`, with the record left open:

- Keys you pass in the context are filled in. `{ ref: 'userId' }` with `{ userId: 7 }` becomes `authorId = 7`.
- Condition fields you **don't** pass become column checks.
- Fields you **do** pass are decided on the spot. `{ status: 'draft' }` in the context turns a `status = 'published'` rule into "no".
- A rule without a condition means every record. That's why the moderator above gets `true`.
- A deny becomes `NOT (...)`, and still wins over every allow.
- A `ref` to a key you didn't pass means no records at all. A missing user id gives nothing, never `authorId IS NULL`.

The result is one of:

| `filter()` returns | Prisma | SQL | Means |
| --- | --- | --- | --- |
| `true` | `{}` | `1=1` | every record |
| `false` | `{ OR: [] }` | `1=0` | nothing, you can skip the query |
| an object | `{ OR: [...] }` etc. | `(... OR ...)` | only matching records |

## Function conditions

A function can't be turned into a query, so `filter()` throws when a rule it needs has one:

```
rolegate: can't turn the condition of allow "read" on "posts" (role "user") into a filter, it's a function. Write it as an object like { authorId: { ref: 'userId' } }.
```

Only the rules for the action you ask about count. A function on `posts.delete` doesn't get in the way of `filter(roles, 'posts', 'read')`.

## Other databases

`filter()` returns a plain tree, so a converter for anything else is a dozen lines. The shapes are `true`, `false`, `{ and: [...] }`, `{ or: [...] }`, `{ not: ... }`, `{ field, eq }` and `{ field, in: [...] }`. The `Filter` type is exported. Have a look at `src/filters/prisma.ts` for a reference.

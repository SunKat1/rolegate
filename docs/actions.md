# Actions on resources

This is the classic part of rolegate: roles that may perform actions on resources. Use it when the question is "may this user **do** something", like edit a post or delete a comment, as opposed to "may they **open** a page" (that's [routes](pages.md)).

## The basics

```ts
import { createRbac } from 'rolegate';

export const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'], comments: ['read', 'write'] } },
    admin: { allow: { '*': ['*'] } },
    blocked: { deny: { '*': ['*'] } },
  },
});

rbac.can('editor', 'posts', 'write'); // true
rbac.can('viewer', 'posts', 'write'); // false
rbac.can(['editor', 'blocked'], 'posts', 'read'); // false, a deny in any role wins
rbac.assert('viewer', 'posts', 'write'); // throws ForbiddenError
```

Resource and action names are plain strings, so call them whatever fits your app. `'*'` means "any resource" or "any action".

The config is checked when you call `createRbac`. An unknown role in `extends`, a rule that isn't a string or `{ action, when? }`, or a broken condition throws right there. That matters when the config comes from JSON, where TypeScript can't catch it. The role name `__proto__` isn't allowed.

## Conditions

Sometimes a role may do something only in certain cases, like editing **their own** posts. That's what `when` is for. It comes in two flavours.

### As an object

```ts
const rbac = createRbac({
  roles: {
    author: {
      allow: {
        posts: [
          { action: 'update', when: { authorId: { ref: 'userId' } } }, // the post's authorId is the user's id
          { action: 'read', when: { status: 'published' } }, // a fixed value
          { action: 'review', when: { status: ['draft', 'pending'] } }, // one of these
        ],
      },
    },
  },
});

rbac.can('author', 'posts', 'update', { userId: 1, authorId: 1 }); // true
rbac.can('author', 'posts', 'update', { userId: 1, authorId: 2 }); // false
rbac.can('author', 'posts', 'update'); // false, no context means no access
```

You pass one flat object with everything the conditions talk about: the user's facts (`userId`) and the record's fields (`authorId`, `status`). Each field of the condition has to match:

| In the condition | Means |
| --- | --- |
| `status: 'published'` | the field equals this value (a string, number, boolean or `null`) |
| `status: ['draft', 'pending']` | the field is one of these |
| `authorId: { ref: 'userId' }` | the field equals another key of the context |

Missing data always means "no". If `authorId` or `userId` isn't there, or either is `null`, the rule doesn't apply. So forgetting to pass the context can't open anything up.

Object conditions are plain data, which buys you three things functions can't do:

- they can live in a [database](database.md#conditions-in-the-database) and be edited by an admin;
- they can be sent to the browser as JSON;
- they can be [turned into a query](filters.md): "give me every post this user may update".

Field names are letters, digits and `_` only, since they may end up as column names in SQL.

### As a function

When equality isn't enough, write a function. It gets the context and returns true or false:

```ts
type Ctx = { userId?: number; ownerId?: number; amount?: number };

// Make sure userId is actually there. Otherwise undefined === undefined is true,
// and anyone gets access the moment you forget to pass a context.
const isOwner = (c: Ctx) => c.userId !== undefined && c.userId === c.ownerId;

const rbac = createRbac({
  roles: {
    author: { allow: { posts: [{ action: 'delete', when: isOwner }] } },
    clerk: { allow: { refunds: [{ action: 'create', when: (c: Ctx) => (c.amount ?? Infinity) <= 100 }] } },
  },
});

rbac.can('author', 'posts', 'delete', { userId: 1, ownerId: 1 }); // true
rbac.can('author', 'posts', 'delete'); // false
```

> When you don't pass a context, `when` gets `{}`. Write your conditions so that missing data means "no".

TypeScript reads the context type from your functions, so `rbac.can('author', 'posts', 'delete', { userId: 'x' })` is a type error here. Functions live in code: they can't go into a database or become a query filter.

## Names are checked by TypeScript

`createRbac` reads resource and action names from the config:

```ts
const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
  },
});

rbac.can('editor', 'posts', 'write'); // fine
rbac.can('editor', 'psots', 'write'); // type error
rbac.can('editor', 'posts', 'wirte'); // type error
```

When the config can't tell the full list (some role has `'*'` as a resource, or the config came from JSON), names fall back to plain strings. To get strict names anyway, and to have typos in the rules themselves caught on startup, list your resources. See [TypeScript and module formats](typescript.md).

Role names stay plain strings on purpose: they come from tokens and sessions at runtime.

## Express

```ts
import { requirePermission } from 'rolegate/express';

app.delete('/posts/:id', requirePermission(rbac, 'posts', 'delete'), handler);
```

By default it reads roles from `req.user.roles` (or `req.user.role`). It sends `401` if there are none (empty strings and `null`s don't count) and `403` if the action isn't allowed. Express isn't actually required: anything with `(req, res, next)` and `res.status().json()` works.

To pass a context, annotate the request type so you get proper typings:

```ts
import type { Request } from 'express';

app.put('/posts/:id', loadPost, requirePermission(rbac, 'posts', 'update', {
  getContext: (req: Request) => ({ userId: req.user?.id, authorId: req.post?.authorId }),
}), handler);
```

`getContext` is synchronous. Load what it needs in an earlier middleware (`loadPost` above), or skip the middleware and call `rbac.assert()` inside your async handler.

If you rebuild `rbac` at runtime, pass a function instead of the object, `requirePermission(() => rbac, ...)`, and the middleware will always use the latest one.

Other frameworks work the same way: [Next.js](frameworks/nextjs.md), [Fastify](frameworks/fastify.md), [Hono](frameworks/hono.md), [NestJS](frameworks/nestjs.md), [tRPC](frameworks/trpc.md).

## React

```tsx
import { RbacProvider, Can, useCan } from 'rolegate/react';

<RbacProvider rbac={rbac} roles={user.roles}>
  <Can resource="posts" action="write" fallback={<span>Read only</span>}>
    <EditButton />
  </Can>
</RbacProvider>;

const can = useCan<typeof rbac>(); // the type argument makes names checked here too
if (can('posts', 'delete', { userId, authorId })) { /* ... */ }
```

> Checks in the UI only make the interface nicer. Always check on the server too.

## Example: a blog where people manage their own posts

Every signed-in user can read all posts and write new ones, but can only edit and delete **their own**. Guests get a `401`.

Two things are up to your app, rolegate doesn't do them:

- **Authentication**: something that sets `req.user = { id, roles: ['user'] }`.
- **Ownership**: store `authorId` on every post and pass it in the context.

**1. Shared permissions**, imported by both the server and the client:

```ts
// shared/permissions.ts
import { createRbac } from 'rolegate';

const own = { authorId: { ref: 'userId' } };

export const rbac = createRbac({
  roles: {
    user: {
      allow: { posts: ['read', 'create', { action: 'update', when: own }, { action: 'delete', when: own }] },
    },
    admin: { extends: ['user'], allow: { posts: ['update', 'delete'] } },
  },
});
```

**2. The server**, where the check that actually matters happens:

```ts
import express from 'express';
import { ForbiddenError, toPrisma } from 'rolegate';
import { requirePermission } from 'rolegate/express';
import { rbac } from '../shared/permissions.js';

const app = express();
app.use(authenticate); // your auth, sets req.user

app.get('/posts', requirePermission(rbac, 'posts', 'read'), listPosts);
app.post('/posts', requirePermission(rbac, 'posts', 'create'), async (req, res) => {
  const post = await db.posts.create({ ...req.body, authorId: req.user!.id });
  res.status(201).json(post);
});

app.delete('/posts/:id', async (req, res, next) => {
  try {
    const post = await db.posts.find(req.params.id);
    rbac.assert(req.user?.roles, 'posts', 'delete', { userId: req.user?.id, authorId: post.authorId });
    await db.posts.delete(post.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

// "My drafts" page: only what this user may edit, straight from the database
app.get('/posts/editable', async (req, res) => {
  const where = toPrisma(rbac.filter(req.user?.roles, 'posts', 'update', { userId: req.user?.id }));
  res.json(await prisma.post.findMany({ where }));
});

app.use((err, _req, res, next) => {
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
  next(err);
});
```

**3. The client** hides what the user can't do anyway:

```tsx
import { RbacProvider, Can, useCan } from 'rolegate/react';
import { rbac } from '../shared/permissions';

<RbacProvider rbac={rbac} roles={me?.roles}>
  <Can resource="posts" action="create"><NewPostButton /></Can>
  <PostList />
</RbacProvider>;

function PostCard({ post }) {
  const can = useCan<typeof rbac>();
  const ctx = { userId: me.id, authorId: post.authorId };
  return (
    <article>
      <h2>{post.title}</h2>
      {can('posts', 'update', ctx) && <EditButton />}
      {can('posts', 'delete', ctx) && <DeleteButton />}
    </article>
  );
}
```

`can()` checks one object at a time. For lists, filter in the query with [`rbac.filter()`](filters.md) instead of checking every row.

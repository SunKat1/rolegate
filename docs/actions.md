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

## Conditions

Sometimes a role may do something only in certain cases, like deleting **their own** posts. That's what `when` is for:

```ts
type Ctx = { userId?: number; ownerId?: number };

// Make sure userId is actually there. Otherwise undefined === undefined is true,
// and anyone gets access the moment you forget to pass a context.
const isOwner = (c: Ctx) => c.userId !== undefined && c.userId === c.ownerId;

const rbac = createRbac<Ctx>({
  roles: {
    author: { allow: { posts: [{ action: 'delete', when: isOwner }] } },
  },
});

rbac.can('author', 'posts', 'delete', { userId: 1, ownerId: 1 }); // true
rbac.can('author', 'posts', 'delete', { userId: 1, ownerId: 2 }); // false
rbac.can('author', 'posts', 'delete'); // false, no context means no access
```

> When you don't pass a context, `when` gets `{}`. Write your conditions so that missing data means "no".

Conditions are functions, so they live in code. If you keep permissions in a database, keep the simple ones there and leave the conditional rules here.

## Express

```ts
import { requirePermission } from 'rolegate/express';

app.delete('/posts/:id', requirePermission(rbac, 'posts', 'delete'), handler);
```

By default it reads roles from `req.user.roles` (or `req.user.role`). It sends `401` if there are none and `403` if the action isn't allowed. Express isn't actually required: anything with `(req, res, next)` and `res.status().json()` works.

To pass a context, annotate the request type so you get proper typings:

```ts
import type { Request } from 'express';

app.put('/posts/:id', loadPost, requirePermission(rbac, 'posts', 'update', {
  getContext: (req: Request) => ({ userId: req.user?.id, ownerId: req.post?.authorId }),
}), handler);
```

`getContext` is synchronous. Load what it needs in an earlier middleware (`loadPost` above), or skip the middleware and call `rbac.assert()` inside your async handler.

If you rebuild `rbac` at runtime, pass a function instead of the object, `requirePermission(() => rbac, ...)`, and the middleware will always use the latest one.

## React

```tsx
import { RbacProvider, Can, useCan } from 'rolegate/react';

<RbacProvider rbac={rbac} roles={user.roles}>
  <Can resource="posts" action="write" fallback={<span>Read only</span>}>
    <EditButton />
  </Can>
</RbacProvider>;

const can = useCan();
if (can('posts', 'delete', { userId, ownerId })) { /* ... */ }
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

export type Ctx = { userId?: number; ownerId?: number };
const isOwner = (c: Ctx) => c.userId !== undefined && c.userId === c.ownerId;

export const rbac = createRbac<Ctx>({
  roles: {
    user: {
      allow: {
        posts: ['read', 'create', { action: 'update', when: isOwner }, { action: 'delete', when: isOwner }],
      },
    },
    admin: { allow: { '*': ['*'] } },
  },
});
```

**2. The server**, where the check that actually matters happens:

```ts
import express from 'express';
import { ForbiddenError } from 'rolegate';
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
    rbac.assert(req.user?.roles, 'posts', 'delete', { userId: req.user?.id, ownerId: post.authorId });
    await db.posts.delete(post.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
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
  const can = useCan();
  const ctx = { userId: me.id, ownerId: post.authorId };
  return (
    <article>
      <h2>{post.title}</h2>
      {can('posts', 'update', ctx) && <EditButton />}
      {can('posts', 'delete', ctx) && <DeleteButton />}
    </article>
  );
}
```

rolegate checks one action on one object at a time. For a "My posts" page, filter in the query (`WHERE author_id = :me`) instead of checking every row.

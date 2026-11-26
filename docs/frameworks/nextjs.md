# Next.js

`rolegate/next` has two helpers, both built on the standard `Request` and `Response`, so they run on the Node and the Edge runtime alike. Next itself isn't a dependency.

- `guardRequest` for middleware: one place that decides which pages and API routes a user may open.
- `withPermission` for Route Handlers: one action per handler, like "delete a post".

Server Components and Server Actions don't need a helper. Call `rbac.can()` or `rbac.assert()` there directly.

## One shared config

```ts
// lib/permissions.ts
import { createRbac, createRouteAccess } from 'rolegate';

export const pages = createRouteAccess({
  roles: {
    guest: { allow: ['/', '/login', '/blog/*', { path: '/api/auth/*', methods: ['*'] }] },
    user: { extends: ['guest'], allow: ['/dashboard/*', '/settings/*', '/api/posts/*'] },
    admin: { extends: ['user'], allow: ['/admin/*', '/api/*'] },
  },
});

export const rbac = createRbac({
  roles: {
    user: { allow: { posts: ['read', 'create', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    admin: { extends: ['user'], allow: { posts: ['delete'] } },
  },
});
```

## Middleware

```ts
// middleware.ts (proxy.ts in Next 16)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { guardRequest } from 'rolegate/next';
import { pages } from './lib/permissions';
import { readSession } from './lib/session';

const guard = guardRequest(pages, {
  // Next has no req.user. Read your session cookie or JWT here, and return 'guest' for anonymous visitors.
  getRoles: async (req: NextRequest) => (await readSession(req))?.roles ?? 'guest',
  loginUrl: '/login',
  forbiddenUrl: '/forbidden',
});

export async function middleware(req: NextRequest) {
  return (await guard(req)) ?? NextResponse.next();
}

// Middleware runs for static files too unless you exclude them
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

What the guard does:

- It checks `req.nextUrl.pathname` and the method against the route rules. The query string doesn't matter, and `/Admin/../admin` tricks don't work.
- No roles: it redirects to `loginUrl`, or answers `401` JSON if you didn't set one.
- Not allowed: it redirects to `forbiddenUrl`, or answers `403` JSON.
- It never redirects to the page the user is already on. If a guest may not open `/forbidden` itself, they get a plain `403` instead of an endless redirect loop. Make sure your login and error pages are allowed for guests.

There are two ways to handle visitors who aren't signed in:

- **A `guest` role**, as above. Public pages are just rules, all in one place. Since everyone has a role, the guard never answers "not signed in": a guest on `/dashboard` goes to `forbiddenUrl`, so make that page offer a login link.
- **No role at all.** Return `undefined` from `getRoles` for anonymous visitors, and they go to `loginUrl`. Then the guard can't let them see anything, so leave the public pages out with the `matcher`.

`skipMethods: ['OPTIONS']` lets CORS preflights through, and `getPath` lets you check something other than the pathname.

## Route Handlers

```ts
// app/api/posts/[id]/route.ts
import { withPermission } from 'rolegate/next';
import { rbac } from '@/lib/permissions';
import { readSession } from '@/lib/session';

type Params = { params: Promise<{ id: string }> };

export const DELETE = withPermission(
  rbac,
  'posts',
  'delete',
  {
    getRoles: async (req: Request) => (await readSession(req))?.roles,
    // can be async, so it can load the post
    getContext: async (req: Request, { params }: Params) => {
      const post = await db.post.findUnique({ where: { id: (await params).id } });
      return { userId: (await readSession(req))?.userId, authorId: post?.authorId };
    },
  },
  async (_req, { params }) => {
    await db.post.delete({ where: { id: (await params).id } });
    return new Response(null, { status: 204 });
  },
);
```

`401` without roles, `403` without permission, otherwise your handler runs. Everything after `req` (the `{ params }` Next passes) goes to `getContext` and the handler.

## Server Components and Server Actions

```tsx
// app/posts/[id]/page.tsx
import { forbidden } from 'next/navigation';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const post = await getPost((await params).id);
  const ctx = { userId: session?.userId, authorId: post.authorId };

  if (!rbac.can(session?.roles, 'posts', 'read', ctx)) forbidden();

  return (
    <article>
      {post.title}
      {rbac.can(session?.roles, 'posts', 'delete', ctx) && <DeleteButton id={post.id} />}
    </article>
  );
}
```

```ts
// app/posts/actions.ts
'use server';

export async function deletePost(id: string) {
  const session = await getSession();
  const post = await getPost(id);
  rbac.assert(session?.roles, 'posts', 'delete', { userId: session?.userId, authorId: post.authorId }); // throws ForbiddenError
  await db.post.delete({ where: { id } });
}
```

Always check inside Server Actions. They are public endpoints, and a hidden button doesn't stop anyone from calling them.

`forbidden()` needs a recent Next.js with the `authInterrupts` option. On older versions use `notFound()` or `redirect('/forbidden')`.

## Client Components

The [React bindings](../pages.md#react) work in Client Components as usual. Wrap the tree in a provider in a `'use client'` file and pass the roles from the session.

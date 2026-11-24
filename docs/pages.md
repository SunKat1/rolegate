# Frontend pages

Use this when the question is "can this user open this page?" Think of an admin section only admins can see, a menu that shows only the links the user can actually follow, or a "you don't have access" screen instead of a broken page.

## Describe who can open what

```ts
// shared/pages.ts
import { createRouteAccess } from 'rolegate';

export const pages = createRouteAccess({
  roles: {
    guest: { allow: ['/', '/login', '/posts/*'] },
    user: { extends: ['guest'], allow: ['/profile', '/settings/*'], deny: ['/login'] },
    admin: { extends: ['user'], allow: ['/admin/*'], deny: ['/admin/billing'] },
  },
});

pages.can('guest', '/posts/42'); // true
pages.can('user', '/admin'); // false
pages.can('admin', '/admin/users'); // true
pages.can('admin', '/admin/billing'); // false, the deny wins over '/admin/*'
```

Everything you know from roles works the same here: `extends` inherits all the routes of another role, a deny in any role wins, and an unknown role sees nothing.

## Route patterns

The patterns are deliberately simple, so you can read them at a glance and store them as plain strings:

| Pattern | Matches | Doesn't match |
| --- | --- | --- |
| `/settings` | `/settings` | `/settings/profile` |
| `/posts/:id` | `/posts/42`, `/posts/hello` | `/posts`, `/posts/42/edit` |
| `/posts/:id/edit` | `/posts/42/edit` | `/posts/42` |
| `/admin/*` | `/admin`, `/admin/users`, `/admin/users/7` | `/administrator` |
| `*` | anything | |

A few things are handled for you, so they don't catch you off guard:

- The query string and hash are ignored: `/posts/42?tab=comments` is `/posts/42`.
- A trailing slash and repeated slashes don't matter: `/admin/users/` is `/admin/users`.
- Case doesn't matter, the same as in React Router and Express. That way `/ADMIN` can't sneak past a deny written for `/admin/*`.

Anything fancier, like regex parameters (`:id(\d+)`), optional segments or a `*` in the middle, throws an error when you create the config. We'd rather tell you right away than have a pattern quietly match nothing.

## Guests

People who aren't signed in still have to see something, like the home page and the login screen. The easiest way is a `guest` role, which you pass when there's no user:

```tsx
<RouteAccessProvider access={pages} roles={user?.roles ?? 'guest'}>
```

## React

Wrap your app in the provider:

```tsx
import { RouteAccessProvider } from 'rolegate/react';
import { pages } from './shared/pages';

<RouteAccessProvider access={pages} roles={user?.roles ?? 'guest'}>
  <App />
</RouteAccessProvider>;
```

### Show a link only if the page can be opened

```tsx
import { CanVisit } from 'rolegate/react';

<CanVisit path="/admin">
  <Link to="/admin">Admin</Link>
</CanVisit>
```

### Filter a menu

```tsx
import { useCanVisit } from 'rolegate/react';

const menu = [
  { title: 'Home', path: '/' },
  { title: 'Profile', path: '/profile' },
  { title: 'Users', path: '/admin/users' },
];

function Menu() {
  const canVisit = useCanVisit();
  return (
    <nav>
      {menu.filter((item) => canVisit(item.path)).map((item) => (
        <Link key={item.path} to={item.path}>{item.title}</Link>
      ))}
    </nav>
  );
}
```

### Protect routes in React Router

rolegate doesn't depend on any router. With React Router, a small layout route is all you need:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCanVisit } from 'rolegate/react';

function PageGuard() {
  const { pathname } = useLocation();
  const canVisit = useCanVisit();
  return canVisit(pathname) ? <Outlet /> : <Navigate to="/forbidden" replace />;
}

<Routes>
  <Route element={<PageGuard />}>
    <Route path="/" element={<Home />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/admin/*" element={<Admin />} />
  </Route>
  <Route path="/forbidden" element={<Forbidden />} />
</Routes>
```

The guard checks the real address (`/admin/users`), not the route pattern, so it works even when you nest routes.

## Remember: this is UX, not security

Hiding a page in the browser doesn't stop anyone from calling your API directly. Whatever data those pages load has to be protected on the server too. See [API routes](api-routes.md) or [actions on resources](actions.md).

## Loading page permissions from the server

If the list of pages and who can see them lives in a database, see [Permissions from a database](database.md). The short version: fetch the rows, build `pages` from them, and pass it to the provider. When the rules change, pass a new object and the UI updates.

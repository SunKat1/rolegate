// A browser-like environment has to exist before React DOM is loaded, so this import goes first.
import 'global-jsdom/register';

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { createRbac, createRouteAccess } from '../src/index.js';
import { Can, CanVisit, RbacProvider, RouteAccessProvider, useCan, useCanVisit } from '../src/react/index.js';

// Testing Library cleans up by itself only under Jest/Vitest. With node:test we do it by hand.
afterEach(cleanup);

/** React logs errors thrown during render. In tests where we expect them, that's just noise. */
function quietly(fn: () => void) {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
}

// ---- actions: RbacProvider, Can, useCan ----

type Ctx = { userId?: number; ownerId?: number };

const rbac = createRbac<Ctx>({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    author: {
      extends: ['viewer'],
      allow: { posts: [{ action: 'delete', when: (c) => c.userId !== undefined && c.userId === c.ownerId }] },
    },
  },
});

test('<Can> shows children when allowed and the fallback when not', () => {
  render(
    <RbacProvider rbac={rbac} roles="viewer">
      <Can resource="posts" action="read"><span>read button</span></Can>
      <Can resource="posts" action="write" fallback={<span>read only</span>}><span>write button</span></Can>
    </RbacProvider>,
  );
  assert.ok(screen.queryByText('read button'));
  assert.equal(screen.queryByText('write button'), null);
  assert.ok(screen.queryByText('read only'));
});

test('<Can> passes the context to conditional rules', () => {
  render(
    <RbacProvider rbac={rbac} roles={['author']}>
      <Can resource="posts" action="delete" ctx={{ userId: 1, ownerId: 1 }}>delete mine</Can>
      <Can resource="posts" action="delete" ctx={{ userId: 1, ownerId: 2 }}>delete theirs</Can>
    </RbacProvider>,
  );
  assert.ok(screen.queryByText('delete mine'));
  assert.equal(screen.queryByText('delete theirs'), null);
});

test('useCan follows role changes', () => {
  function Status() {
    const can = useCan();
    return <span>{can('posts', 'read') ? 'yes' : 'no'}</span>;
  }
  const { rerender } = render(
    <RbacProvider rbac={rbac} roles={undefined}>
      <Status />
    </RbacProvider>,
  );
  assert.ok(screen.queryByText('no'));

  // the user signs in
  rerender(
    <RbacProvider rbac={rbac} roles="viewer">
      <Status />
    </RbacProvider>,
  );
  assert.ok(screen.queryByText('yes'));
});

test('useCan outside of a provider says what is wrong', () => {
  function Orphan() {
    useCan();
    return null;
  }
  quietly(() => assert.throws(() => render(<Orphan />), /inside <RbacProvider>/));
});

// ---- pages: RouteAccessProvider, CanVisit, useCanVisit ----

const pages = createRouteAccess({
  roles: {
    guest: { allow: ['/', '/posts/*'] },
    admin: { extends: ['guest'], allow: ['/admin/*'], deny: ['/admin/billing'] },
  },
});

test('<CanVisit> shows a link only if the page can be opened', () => {
  render(
    <RouteAccessProvider access={pages} roles="guest">
      <CanVisit path="/posts/42"><span>post link</span></CanVisit>
      <CanVisit path="/admin" fallback={<span>no admin for you</span>}><span>admin link</span></CanVisit>
    </RouteAccessProvider>,
  );
  assert.ok(screen.queryByText('post link'));
  assert.equal(screen.queryByText('admin link'), null);
  assert.ok(screen.queryByText('no admin for you'));
});

test('useCanVisit filters a menu', () => {
  const menu = ['/', '/admin/users', '/admin/billing'];
  function Menu() {
    const canVisit = useCanVisit();
    return (
      <nav>
        {menu.filter(canVisit).map((path) => (
          <a key={path} href={path}>{path}</a>
        ))}
      </nav>
    );
  }
  render(
    <RouteAccessProvider access={pages} roles="admin">
      <Menu />
    </RouteAccessProvider>,
  );
  const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/', '/admin/users']);
});

test('passing a new access object re-renders with the new rules', () => {
  const ui = (access: typeof pages) => (
    <RouteAccessProvider access={access} roles="guest">
      <CanVisit path="/admin">admin link</CanVisit>
    </RouteAccessProvider>
  );
  const { rerender } = render(ui(pages));
  assert.equal(screen.queryByText('admin link'), null);

  // e.g. the rules were reloaded from the server and guests may now see /admin
  rerender(ui(createRouteAccess({ roles: { guest: { allow: ['*'] } } })));
  assert.ok(screen.queryByText('admin link'));
});

test('useCanVisit outside of a provider says what is wrong', () => {
  function Orphan() {
    useCanVisit();
    return null;
  }
  quietly(() => assert.throws(() => render(<Orphan />), /inside <RouteAccessProvider>/));
});

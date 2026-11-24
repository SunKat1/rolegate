// RouteAccessProvider, <CanVisit> and useCanVisit: showing only the pages a user can open.
import { quietly } from '../helpers/dom.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen } from '@testing-library/react';
import { createRouteAccess } from '../../src/index.js';
import { CanVisit, RouteAccessProvider, useCanVisit } from '../../src/react/index.js';

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

// RbacProvider, <Can> and useCan: hiding buttons for actions the user can't do.
import { quietly } from '../helpers/dom.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen } from '@testing-library/react';
import { createRbac } from '../../src/index.js';
import { Can, RbacProvider, useCan } from '../../src/react/index.js';

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

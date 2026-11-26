// requirePermission: one fixed action on one resource, mounted on a route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';
import type { Rbac } from '../../src/index.js';
import { requirePermission } from '../../src/express/index.js';
import { run } from '../helpers/middleware.js';

const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
  },
});

test('401 when there is no user', () => {
  const r = run(requirePermission(rbac, 'posts', 'read'), {});
  assert.equal(r.status, 401);
  assert.equal(r.nextCalled, false);
});

test('401 when the roles hold nothing usable', () => {
  assert.equal(run(requirePermission(rbac, 'posts', 'read'), { user: { role: '' } }).status, 401);
  assert.equal(run(requirePermission(rbac, 'posts', 'read'), { user: { roles: [''] } }).status, 401);
  assert.equal(run(requirePermission(rbac, 'posts', 'read'), { user: { roles: [null as never] } }).status, 401);
});

test('403 when the role lacks permission, and the body says what was not allowed', () => {
  const r = run(requirePermission(rbac, 'posts', 'write'), { user: { role: 'viewer' } });
  assert.equal(r.status, 403);
  assert.equal(r.nextCalled, false);
  assert.deepEqual(r.body, { error: 'Forbidden', resource: 'posts', action: 'write' });
});

test('calls next() when allowed (role or roles)', () => {
  assert.equal(run(requirePermission(rbac, 'posts', 'write'), { user: { role: 'editor' } }).nextCalled, true);
  assert.equal(run(requirePermission(rbac, 'posts', 'read'), { user: { roles: ['viewer'] } }).nextCalled, true);
});

test('custom getRoles and getContext', () => {
  const owned = createRbac<{ owner: boolean }>({
    roles: { member: { allow: { posts: [{ action: 'edit', when: (c) => c.owner }] } } },
  });
  const mw = requirePermission(owned, 'posts', 'edit', {
    getRoles: (req: { headers: { 'x-role'?: string } }) => req.headers['x-role'],
    getContext: () => ({ owner: true }),
  });
  assert.equal(run(mw, { headers: { 'x-role': 'member' } }).nextCalled, true);
});

test('a getter picks up a rebuilt rbac', () => {
  // a loose Rbac, since the rebuilt one has different actions (rules from a DB look like that)
  let current: Rbac = rbac;
  const mw = requirePermission(() => current, 'posts', 'delete');
  assert.equal(run(mw, { user: { role: 'editor' } }).status, 403);
  current = createRbac({ roles: { editor: { allow: { posts: ['*'] } } } });
  assert.equal(run(mw, { user: { role: 'editor' } }).nextCalled, true);
});

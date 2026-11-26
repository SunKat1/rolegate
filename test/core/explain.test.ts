// explain(): the same answer as can(), with the reason attached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';

const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
    owner: { allow: { posts: [{ action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    blocked: { deny: { '*': ['*'] } },
  },
});

test('says which role allowed it, and where the rule was written', () => {
  const d = rbac.explain('editor', 'posts', 'read');
  assert.equal(d.allowed, true);
  assert.equal(d.reason, 'allowed');
  assert.equal(d.role, 'editor');
  assert.deepEqual(d.rule, { effect: 'allow', role: 'viewer', resource: 'posts', action: 'read', condition: 'none' });
  assert.equal(d.message, 'allowed read on posts: role "viewer" allows read on posts');
});

test('a deny is reported even when another role allows', () => {
  const d = rbac.explain(['editor', 'blocked'], 'posts', 'write');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'denied');
  assert.equal(d.role, 'blocked');
  assert.equal(d.rule?.effect, 'deny');
});

test('no matching rule, and conditions that failed', () => {
  assert.equal(rbac.explain('viewer', 'posts', 'write').reason, 'no-match');
  const d = rbac.explain('owner', 'posts', 'delete', { authorId: 1, userId: 2 });
  assert.equal(d.reason, 'no-match');
  assert.match(d.message, /no rule of "owner" allows it/);
  assert.equal(rbac.explain('owner', 'posts', 'delete', { authorId: 1, userId: 1 }).rule?.condition, 'object');
});

test('unknown roles are listed, they are often a typo or a stale token', () => {
  const d = rbac.explain(['Editor', 'viewer'], 'posts', 'read');
  assert.equal(d.allowed, true);
  assert.deepEqual(d.unknownRoles, ['Editor']);

  const none = rbac.explain('ghost', 'posts', 'read');
  assert.equal(none.reason, 'no-roles');
  assert.match(none.message, /got "ghost"/);
  assert.match(rbac.explain(undefined, 'posts', 'read').message, /no roles at all/);
});

test('always agrees with can()', () => {
  const cases: [string[], 'posts', 'read' | 'write' | 'delete', object?][] = [
    [['viewer'], 'posts', 'read'],
    [['viewer'], 'posts', 'write'],
    [['editor', 'blocked'], 'posts', 'read'],
    [['owner'], 'posts', 'delete', { authorId: 3, userId: 3 }],
    [['owner'], 'posts', 'delete'],
    [[], 'posts', 'read'],
  ];
  for (const [roles, resource, action, ctx] of cases) {
    assert.equal(rbac.explain(roles, resource, action, ctx as never).allowed, rbac.can(roles, resource, action, ctx as never));
  }
});

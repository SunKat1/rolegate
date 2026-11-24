// The resource engine: roles, inheritance, deny wins, conditions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac, ForbiddenError } from '../../src/index.js';

const rbac = createRbac<{ userId?: number; ownerId?: number }>({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: {
      extends: ['viewer'],
      allow: { posts: ['write'], comments: ['read', 'write'] },
    },
    author: {
      allow: {
        posts: [{ action: 'delete', when: (c) => c.userId !== undefined && c.userId === c.ownerId }],
      },
    },
    admin: { allow: { '*': ['*'] } },
    blocked: { extends: ['editor'], deny: { '*': ['*'] } },
    noDeletes: { extends: ['admin'], deny: { posts: ['delete'] } },
  },
});

test('allows what the role grants', () => {
  assert.equal(rbac.can('viewer', 'posts', 'read'), true);
  assert.equal(rbac.can('viewer', 'posts', 'write'), false);
});

test('inherits permissions through "extends"', () => {
  assert.equal(rbac.can('editor', 'posts', 'read'), true);
  assert.equal(rbac.can('editor', 'posts', 'write'), true);
  assert.equal(rbac.can('editor', 'users', 'read'), false);
});

test('wildcards grant everything', () => {
  assert.equal(rbac.can('admin', 'anything', 'whatever'), true);
});

test('deny beats allow, including inherited allows', () => {
  assert.equal(rbac.can('blocked', 'posts', 'read'), false);
  assert.equal(rbac.can('noDeletes', 'posts', 'delete'), false);
  assert.equal(rbac.can('noDeletes', 'posts', 'write'), true);
});

test('conditional rules use the context', () => {
  assert.equal(rbac.can('author', 'posts', 'delete', { userId: 1, ownerId: 1 }), true);
  assert.equal(rbac.can('author', 'posts', 'delete', { userId: 1, ownerId: 2 }), false);
  assert.equal(rbac.can('author', 'posts', 'delete'), false);
});

test('multiple roles combine; a deny in any role wins', () => {
  assert.equal(rbac.can(['viewer', 'author'], 'posts', 'read'), true);
  assert.equal(rbac.can(['editor', 'blocked'], 'posts', 'read'), false);
});

test('unknown or missing roles get nothing', () => {
  assert.equal(rbac.can('ghost', 'posts', 'read'), false);
  assert.equal(rbac.can(undefined, 'posts', 'read'), false);
  assert.equal(rbac.can([], 'posts', 'read'), false);
});

test('assert throws ForbiddenError', () => {
  assert.throws(() => rbac.assert('viewer', 'posts', 'write'), ForbiddenError);
  assert.doesNotThrow(() => rbac.assert('viewer', 'posts', 'read'));
});

test('exposes configured role names', () => {
  assert.deepEqual([...rbac.roles].sort(), ['admin', 'author', 'blocked', 'editor', 'noDeletes', 'viewer']);
});

test('names that live on Object.prototype are not roles', () => {
  assert.equal(rbac.can('constructor', 'posts', 'read'), false);
});

test('ForbiddenError carries the resource and action', () => {
  try {
    rbac.assert('viewer', 'posts', 'write');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof ForbiddenError);
    assert.equal(err.name, 'ForbiddenError');
    assert.equal(err.resource, 'posts');
    assert.equal(err.action, 'write');
    assert.equal(err.message, 'Forbidden: cannot write posts');
  }
});

test('a deny on one resource does not leak to others', () => {
  assert.equal(rbac.can('noDeletes', 'comments', 'delete'), true);
});

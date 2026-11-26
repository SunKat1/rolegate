// Conditions written as objects: { authorId: { ref: 'userId' } } and friends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';

const rbac = createRbac({
  roles: {
    user: {
      allow: {
        posts: [
          { action: 'read', when: { status: 'published' } },
          { action: 'read', when: { authorId: { ref: 'userId' } } },
          { action: 'update', when: { authorId: { ref: 'userId' }, status: ['draft', 'review'] } },
        ],
      },
    },
    reviewer: { deny: { posts: [{ action: 'read', when: { archived: true } }] }, allow: { posts: ['read'] } },
  },
});

test('a fixed value has to match', () => {
  assert.equal(rbac.can('user', 'posts', 'read', { status: 'published' }), true);
  assert.equal(rbac.can('user', 'posts', 'read', { status: 'draft' }), false);
});

test('a ref compares two fields of the context', () => {
  assert.equal(rbac.can('user', 'posts', 'read', { authorId: 7, userId: 7 }), true);
  assert.equal(rbac.can('user', 'posts', 'read', { authorId: 7, userId: 8 }), false);
});

test('missing data means no, even when both sides are missing', () => {
  assert.equal(rbac.can('user', 'posts', 'read'), false);
  assert.equal(rbac.can('user', 'posts', 'read', {}), false);
  assert.equal(rbac.can('user', 'posts', 'read', { authorId: null, userId: null }), false);
});

test('a list means "one of these", and every field has to hold', () => {
  assert.equal(rbac.can('user', 'posts', 'update', { authorId: 1, userId: 1, status: 'review' }), true);
  assert.equal(rbac.can('user', 'posts', 'update', { authorId: 1, userId: 1, status: 'published' }), false);
  assert.equal(rbac.can('user', 'posts', 'update', { authorId: 2, userId: 1, status: 'draft' }), false);
});

test('object conditions work on deny rules too', () => {
  assert.equal(rbac.can('reviewer', 'posts', 'read', { archived: false }), true);
  assert.equal(rbac.can('reviewer', 'posts', 'read', { archived: true }), false);
});

test('inherited context keys from the prototype are not data', () => {
  const ctx = Object.create({ status: 'published' });
  assert.equal(rbac.can('user', 'posts', 'read', ctx), false);
});

test('broken conditions throw when the config is created', () => {
  const build = (when: unknown) => () => createRbac({ roles: { a: { allow: { posts: [{ action: 'read', when } as never] } } } });
  assert.throws(build({}), /empty object/);
  assert.throws(build({ 'author id': 1 }), /valid field name/);
  assert.throws(build({ authorId: { ref: 'user.id' } }), /valid context key/);
  assert.throws(build({ status: [] }), /empty/);
  assert.throws(build({ status: [{}] }), /should only hold/);
  assert.throws(build({ status: { equals: 1 } }), /a value, a list of values/);
  assert.throws(build('yes'), /should be a function or an object/);
});

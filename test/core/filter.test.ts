// rbac.filter(): which records a user may touch, as a database-neutral tree.
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
    moderator: { extends: ['user'], allow: { posts: ['read', 'update'] } },
    noArchive: { deny: { posts: [{ action: '*', when: { archived: true } }] } },
    admin: { allow: { '*': ['*'] } },
    fn: { allow: { posts: [{ action: 'read', when: () => true }] } },
  },
});

test('refs are filled in from the context, other fields become column checks', () => {
  assert.deepEqual(rbac.filter('user', 'posts', 'read', { userId: 7 }), {
    or: [{ field: 'status', eq: 'published' }, { field: 'authorId', eq: 7 }],
  });
  assert.deepEqual(rbac.filter('user', 'posts', 'update', { userId: 7 }), {
    and: [{ field: 'authorId', eq: 7 }, { field: 'status', in: ['draft', 'review'] }],
  });
});

test('a plain allow means every record, no roles means none', () => {
  assert.equal(rbac.filter('moderator', 'posts', 'read', { userId: 1 }), true);
  assert.equal(rbac.filter('admin', 'posts', 'update'), true);
  assert.equal(rbac.filter('ghost', 'posts', 'read'), false);
  assert.equal(rbac.filter('user', 'posts', 'update', { userId: 1, status: 'published' }), false);
});

test('a missing ref means no rows, not "authorId IS NULL"', () => {
  assert.deepEqual(rbac.filter('user', 'posts', 'read', {}), { field: 'status', eq: 'published' });
  assert.equal(rbac.filter('user', 'posts', 'update', {}), false);
});

test('fields given in the context are decided right away', () => {
  assert.deepEqual(rbac.filter('user', 'posts', 'update', { userId: 7, status: 'draft' }), { field: 'authorId', eq: 7 });
  assert.equal(rbac.filter('user', 'posts', 'update', { userId: 7, status: 'published' }), false);
});

test('denies turn into NOT, and still win', () => {
  assert.deepEqual(rbac.filter(['admin', 'noArchive'], 'posts', 'read'), { not: { field: 'archived', eq: true } });
  assert.equal(rbac.filter(['admin', 'noArchive'], 'posts', 'read', { archived: true }), false);
});

test('function conditions cannot become a query, so it says so', () => {
  assert.throws(() => rbac.filter('fn', 'posts', 'read'), /role "fn".*it's a function/);
  // a function on an action that isn't asked about doesn't matter
  assert.equal(rbac.filter('fn', 'posts', 'update'), false);
});

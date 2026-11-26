// explain() on routes: who decided, and how the path was read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess } from '../../src/index.js';

const access = createRouteAccess({
  roles: {
    reader: { allow: [{ path: '/api/posts/*', methods: ['get'] }] },
    writer: { extends: ['reader'], allow: [{ path: '/api/posts/:id', methods: ['PUT'] }] },
    admin: { allow: ['/api/*'], deny: [{ path: '/api/posts/:id', methods: ['DELETE'] }] },
  },
});

test('reports the rule, the role it was written in and the normalized path', () => {
  const d = access.explain('writer', '/API/posts/./42/?x=1', 'head');
  assert.equal(d.allowed, true);
  assert.equal(d.path, '/api/posts/42');
  assert.deepEqual(d.rule, { effect: 'allow', role: 'reader', path: '/api/posts/*', methods: ['GET'] });
  assert.equal(d.message, 'allowed GET /api/posts/42: role "reader" allows GET /api/posts/*');
});

test('denies and misses', () => {
  const d = access.explain('admin', '/api/posts/1', 'DELETE');
  assert.equal(d.reason, 'denied');
  assert.match(d.message, /role "admin" denies DELETE \/api\/posts\/:id/);
  assert.equal(access.explain('reader', '/api/users').reason, 'no-match');
});

test('a path that cannot be decoded is its own reason', () => {
  const d = access.explain('admin', '/api/%zz');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'bad-path');
});

// The route engine: pages (any method) and API routes (method matters).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess, ForbiddenError } from '../../src/index.js';

// ---- pages ----

const pages = createRouteAccess({
  roles: {
    guest: { allow: ['/', '/login', '/posts/*'] },
    user: { extends: ['guest'], allow: ['/profile'], deny: ['/login'] },
    admin: { extends: ['user'], allow: ['/admin/*'], deny: ['/admin/billing'] },
    banned: { deny: ['*'] },
  },
});

test('pages: a role sees what it allows plus what it inherits', () => {
  assert.equal(pages.can('guest', '/posts/42'), true);
  assert.equal(pages.can('guest', '/profile'), false);
  assert.equal(pages.can('user', '/profile'), true);
  assert.equal(pages.can('user', '/posts/42'), true);
  assert.equal(pages.can('admin', '/admin/users'), true);
});

test('pages: deny wins, even over a wildcard allow', () => {
  assert.equal(pages.can('user', '/login'), false);
  assert.equal(pages.can('admin', '/admin/billing'), false);
  assert.equal(pages.can(['admin', 'banned'], '/'), false);
});

test('pages: unknown or missing roles see nothing', () => {
  assert.equal(pages.can('ghost', '/'), false);
  assert.equal(pages.can(undefined, '/'), false);
  assert.equal(pages.can([], '/'), false);
});

test('junk inside the roles list is skipped, not trusted', () => {
  // roles often come from a token, so they aren't always what the types promise
  assert.equal(pages.can([null, '', 'user'] as never, '/profile'), true);
  assert.equal(pages.can(42 as never, '/'), false);
});

test('exposes configured role names', () => {
  assert.deepEqual([...pages.roles].sort(), ['admin', 'banned', 'guest', 'user']);
});

// ---- API routes ----

const api = createRouteAccess({
  roles: {
    reader: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    writer: {
      extends: ['reader'],
      allow: [{ path: '/api/posts', methods: ['POST'] }, { path: '/api/posts/:id', methods: ['put', 'PATCH'] }],
    },
    admin: { allow: ['/api/*'], deny: [{ path: '/api/posts/:id', methods: ['DELETE'] }] },
  },
});

test('api: methods are part of the rule', () => {
  assert.equal(api.can('reader', '/api/posts/1', 'GET'), true);
  assert.equal(api.can('reader', '/api/posts/1', 'PUT'), false);
  assert.equal(api.can('writer', '/api/posts/1', 'PUT'), true);
  assert.equal(api.can('writer', '/api/posts', 'post'), true);
  assert.equal(api.can('admin', '/api/users', 'DELETE'), true);
  assert.equal(api.can('admin', '/api/posts/1', 'DELETE'), false);
});

test('api: no method means GET, and HEAD is checked as GET', () => {
  assert.equal(api.can('reader', '/api/posts/1'), true);
  assert.equal(api.can('reader', '/api/posts/1', 'HEAD'), true);
  const strict = createRouteAccess({
    roles: { r: { allow: ['*'], deny: [{ path: '/secret', methods: ['GET'] }] } },
  });
  assert.equal(strict.can('r', '/secret', 'HEAD'), false);
});

test('methods: ["*"] is the same as any method', () => {
  const access = createRouteAccess({ roles: { r: { allow: [{ path: '/x', methods: ['*'] }] } } });
  assert.equal(access.can('r', '/x', 'DELETE'), true);
});

test('assert throws ForbiddenError with the path and method', () => {
  assert.throws(() => api.assert('reader', '/api/posts/1', 'delete'), (err: unknown) => {
    assert.ok(err instanceof ForbiddenError);
    assert.equal(err.message, 'Forbidden: cannot DELETE /api/posts/1');
    return true;
  });
  assert.doesNotThrow(() => api.assert('reader', '/api/posts/1'));
});

// ---- the config ----

test('the config is read once: later changes to it do not leak in', () => {
  const config = { roles: { r: { allow: ['/a'] as string[] } } };
  const access = createRouteAccess(config);
  config.roles.r.allow.push('/b');
  assert.equal(access.can('r', '/b'), false);
});

test('roles named like Object.prototype members are just roles', () => {
  const access = createRouteAccess({ roles: { constructor: { allow: ['/a'] } } });
  assert.equal(access.can('constructor', '/a'), true);
  assert.equal(access.can('toString', '/a'), false);
});

test('bad configs fail on creation and name the role', () => {
  assert.throws(() => createRouteAccess({ roles: { editor: { allow: ['posts'] } } }), /in role "editor"/);
  assert.throws(() => createRouteAccess({ roles: { a: { allow: [{ path: '/x', methods: [] }] } } }), /empty/);
  assert.throws(() => createRouteAccess({ roles: { a: { extends: ['nope'] } } }), /unknown role "nope"/);
});

test('a config with the wrong shape fails on creation, not on a request', () => {
  const bad = (roles: unknown) => () => createRouteAccess({ roles } as never);
  assert.throws(bad(undefined), /config\.roles should be an object/);
  assert.throws(bad({ a: { allow: '/x' } }), /allow of role "a" should be a list/);
  assert.throws(bad({ a: { allow: [42] } }), /should be a path or \{ path, methods\? \}/);
  assert.throws(bad({ a: { allow: [{ path: '/x', methods: 'GET' }] } }), /"methods" for "\/x" should be a list/);
  assert.throws(bad({ a: { allow: [{ path: '/x', methods: [''] }] } }), /"methods" for "\/x" should be a list/);
});

test('"__proto__" is refused as a role name', () => {
  // JSON.parse makes it a real key, which is what a config from a file or an API would look like
  const roles = JSON.parse('{"__proto__": {"allow": ["*"]}}');
  assert.throws(() => createRouteAccess({ roles }), /"__proto__" can't be used as a role name/);
});

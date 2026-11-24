import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess, routeConfigFromRows, ForbiddenError } from '../src/index.js';

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

test('assert throws ForbiddenError with the path and method', () => {
  assert.throws(() => api.assert('reader', '/api/posts/1', 'delete'), (err: unknown) => {
    assert.ok(err instanceof ForbiddenError);
    assert.equal(err.message, 'Forbidden: cannot DELETE /api/posts/1');
    return true;
  });
  assert.doesNotThrow(() => api.assert('reader', '/api/posts/1'));
});

test('bad configs fail on creation and name the role', () => {
  assert.throws(() => createRouteAccess({ roles: { editor: { allow: ['posts'] } } }), /in role "editor"/);
  assert.throws(() => createRouteAccess({ roles: { a: { allow: [{ path: '/x', methods: [] }] } } }), /empty/);
  assert.throws(() => createRouteAccess({ roles: { a: { extends: ['nope'] } } }), /unknown role "nope"/);
});

test('rows from a database turn into a working config', () => {
  const rows = [
    { role: 'user', path: '/dashboard', method: null, effect: null },
    { role: 'user', path: '/posts/:id', method: 'GET' },
    { role: 'admin', path: '/admin/*' },
    { role: 'admin', path: '/admin/billing', effect: 'deny' as const },
  ];
  const access = createRouteAccess(routeConfigFromRows(rows, { extends: { admin: ['user'] } }));
  assert.equal(access.can('user', '/dashboard'), true);
  assert.equal(access.can('user', '/posts/5', 'DELETE'), false);
  assert.equal(access.can('admin', '/posts/5'), true);
  assert.equal(access.can('admin', '/admin/billing'), false);
  assert.throws(() => routeConfigFromRows([{ role: 'x', path: '/', effect: 'maybe' as never }]), /unknown effect/);
});

test('methods: ["*"] is the same as any method', () => {
  const access = createRouteAccess({ roles: { r: { allow: [{ path: '/x', methods: ['*'] }] } } });
  assert.equal(access.can('r', '/x', 'DELETE'), true);
});

test('a role with only "extends" and no rules of its own still works', () => {
  const config = routeConfigFromRows([{ role: 'user', path: '/home' }], { extends: { manager: ['user'] } });
  assert.deepEqual(config.roles.manager, { extends: ['user'] });
  assert.equal(createRouteAccess(config).can('manager', '/home'), true);
});

test('a row with a method allows only that method', () => {
  const access = createRouteAccess(routeConfigFromRows([{ role: 'r', path: '/api/x', method: 'post' }]));
  assert.equal(access.can('r', '/api/x', 'POST'), true);
  assert.equal(access.can('r', '/api/x', 'GET'), false);
});

test('routeConfigFromRows copies the extends lists instead of sharing them', () => {
  const parents = { admin: ['user'] };
  const config = routeConfigFromRows([{ role: 'user', path: '/' }], { extends: parents });
  config.roles.admin.extends!.push('hacker');
  assert.deepEqual(parents.admin, ['user']);
});

test('exposes configured role names', () => {
  assert.deepEqual([...pages.roles].sort(), ['admin', 'banned', 'guest', 'user']);
});

test('the config is checked once: later changes to it do not leak in', () => {
  const config = { roles: { r: { allow: ['/a'] as string[] } } };
  const access = createRouteAccess(config);
  config.roles.r.allow.push('/b');
  assert.equal(access.can('r', '/b'), false);
});

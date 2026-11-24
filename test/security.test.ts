// Tests for the ways people try to get around the checks, and for broken
// configs that used to slip through until a request hit them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac, createRouteAccess, normalizePath, routeConfigFromRows } from '../src/index.js';
import { guardRoutes } from '../src/express/index.js';
import type { NextLike, ResponseLike } from '../src/express/index.js';

const pages = createRouteAccess({
  roles: {
    user: { allow: ['/public/*', '/files/:name'], deny: ['/public/secret'] },
  },
});

test('".." can not walk out of an allowed section', () => {
  // express.static and proxies resolve these to /admin/..., so must we
  assert.equal(pages.can('user', '/public/../admin/secret.html'), false);
  assert.equal(pages.can('user', '/public/%2e%2e/admin/secret.html'), false);
  assert.equal(pages.can('user', '/public/%2E%2E%2Fadmin'), false);
  assert.equal(pages.can('user', '/public/..%5Cadmin'), false);
  // walking around inside the section is still fine
  assert.equal(pages.can('user', '/public/a/../b'), true);
  assert.equal(pages.can('user', '/public/./a'), true);
});

test('encoded characters can not dodge a deny', () => {
  assert.equal(pages.can('user', '/public/secret'), false);
  assert.equal(pages.can('user', '/public/%73ecret'), false);
  assert.equal(pages.can('user', '/public/SECRET'), false);
  assert.equal(pages.can('user', '/public/x/../secret'), false);
});

test('a path with broken percent-encoding is always denied', () => {
  assert.equal(pages.can('user', '/public/%zz'), false);
  assert.equal(createRouteAccess({ roles: { all: { allow: ['*'] } } }).can('all', '/%E0%A4%A'), false);
});

test('an encoded slash turns into a real one', () => {
  // ":name" is one segment, "a%2Fb" is two once decoded
  assert.equal(pages.can('user', '/files/report.pdf'), true);
  assert.equal(pages.can('user', '/files/a%2Fb'), false);
});

test('normalizePath shows the path the way checks see it', () => {
  assert.equal(normalizePath('/Public/./a/../B/?x=1'), '/public/b');
  assert.equal(normalizePath('/../../etc'), '/etc');
  assert.equal(normalizePath('/a/%zz'), '/a/%zz'); // never throws
});

test('patterns with "." or ".." are refused', () => {
  assert.throws(() => createRouteAccess({ roles: { a: { allow: ['/public/../admin'] } } }), /"\." and "\.\." segments/);
});

test('a "__proto__" row can not leak routes into every role', () => {
  const rows = [
    { role: 'viewer', path: '/blocked', effect: 'deny' as const },
    { role: '__proto__', path: '/admin/*' },
  ];
  assert.throws(() => routeConfigFromRows(rows), /"__proto__" can't be used as a role name/);
  assert.equal(({} as Record<string, unknown>).allow, undefined);
});

test('"__proto__" is refused in options.extends and in configs too', () => {
  assert.throws(() => routeConfigFromRows([], { extends: JSON.parse('{"__proto__": ["user"]}') }), /__proto__/);
  const roles = JSON.parse('{"__proto__": {"allow": ["*"]}}');
  assert.throws(() => createRouteAccess({ roles }), /__proto__/);
  assert.throws(() => createRbac({ roles }), /__proto__/);
});

test('roles named like Object.prototype members work as normal roles', () => {
  const access = createRouteAccess(routeConfigFromRows([{ role: 'constructor', path: '/a' }]));
  assert.equal(access.can('constructor', '/a'), true);
  assert.equal(access.can('toString', '/a'), false);
});

test('broken rbac configs fail when the checker is built', () => {
  const bad = (roles: unknown) => () => createRbac({ roles } as never);
  assert.throws(bad(undefined), /config\.roles should be an object/);
  assert.throws(bad({ a: 'admin' }), /role "a" should be an object/);
  assert.throws(bad({ a: { extends: 'b' } }), /"extends" of role "a"/);
  assert.throws(bad({ a: { allow: ['read'] } }), /allow of role "a" should be an object/);
  assert.throws(bad({ a: { allow: { posts: 'read' } } }), /rules for "posts" should be a list/);
  assert.throws(bad({ a: { allow: { posts: [{ act: 'read' }] } } }), /action name or \{ action, when\? \}/);
  assert.throws(bad({ a: { deny: { posts: [{ action: 'read', when: true }] } } }), /"when" for action "read" should be a function/);
});

test('broken route configs fail when the checker is built', () => {
  const bad = (roles: unknown) => () => createRouteAccess({ roles } as never);
  assert.throws(bad({ a: { allow: '/x' } }), /allow of role "a" should be a list/);
  assert.throws(bad({ a: { allow: [42] } }), /should be a path or \{ path, methods\? \}/);
  assert.throws(bad({ a: { allow: [{ path: '/x', methods: 'GET' }] } }), /"methods" for "\/x" should be a list/);
  assert.throws(bad({ a: { allow: [{ path: '/x', methods: [''] }] } }), /"methods" for "\/x" should be a list/);
});

test('broken rows fail with the role and path in the message', () => {
  assert.throws(() => routeConfigFromRows([{ role: '', path: '/x' }]), /non-empty strings/);
  assert.throws(() => routeConfigFromRows([{ role: 'a', path: 5 as never }]), /"path" should be a string \(row for role "a"/);
  assert.throws(() => routeConfigFromRows([{ role: 'a', path: '/x', method: 1 as never }]), /"method" should be a string/);
});

test('junk inside the roles list is ignored', () => {
  const access = createRouteAccess({ roles: { user: { allow: ['/a'] } } });
  assert.equal(access.can([null, '', 'user'] as never, '/a'), true);
  assert.equal(access.can(42 as never, '/a'), false);
});

/** Runs a middleware with a fake response and tells what it did. */
function run(mw: (req: never, res: ResponseLike, next: NextLike) => void, req: object) {
  const out: { status?: number; nextCalled: boolean } = { nextCalled: false };
  const res = {
    status(code: number) { out.status = code; return res; },
    json() { return res; },
  };
  mw(req as never, res, () => { out.nextCalled = true; });
  return out;
}

test('guardRoutes: roles with nothing usable in them get a 401', () => {
  const guard = guardRoutes(pages);
  assert.equal(run(guard, { user: { roles: [''] }, path: '/public' }).status, 401);
  assert.equal(run(guard, { user: { roles: [null] }, path: '/public' }).status, 401);
});

test('guardRoutes: skipMethods lets CORS preflights through, nothing else', () => {
  const guard = guardRoutes(pages, { skipMethods: ['options'] });
  assert.equal(run(guard, { method: 'OPTIONS', path: '/anything' }).nextCalled, true);
  assert.equal(run(guard, { method: 'GET', path: '/anything' }).status, 401);
  // by default nothing is skipped
  assert.equal(run(guardRoutes(pages), { method: 'OPTIONS', path: '/public' }).status, 401);
});

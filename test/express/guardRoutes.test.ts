// guardRoutes: one middleware that checks every request against route rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess } from '../../src/index.js';
import { guardRoutes } from '../../src/express/index.js';
import type { RequestLike } from '../../src/express/index.js';
import { run } from '../helpers/middleware.js';

const api = createRouteAccess({
  roles: {
    viewer: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    editor: { extends: ['viewer'], allow: [{ path: '/api/posts/:id', methods: ['PUT'] }] },
  },
});

test('401 without roles, 403 when the route is not allowed', () => {
  assert.equal(run(guardRoutes(api), { method: 'GET', path: '/api/posts/1' }).status, 401);
  const r = run(guardRoutes(api), { user: { role: 'viewer' }, method: 'PUT', path: '/api/posts/1' });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Forbidden', path: '/api/posts/1', method: 'PUT' });
});

test('roles with nothing usable in them get a 401', () => {
  assert.equal(run(guardRoutes(api), { user: { roles: [''] }, path: '/api/posts/1' }).status, 401);
  assert.equal(run(guardRoutes(api), { user: { roles: [null as never] }, path: '/api/posts/1' }).status, 401);
});

test('lets allowed requests through', () => {
  assert.equal(run(guardRoutes(api), { user: { role: 'editor' }, method: 'PUT', path: '/api/posts/1' }).nextCalled, true);
});

test('a request without a method is treated as GET', () => {
  assert.equal(run(guardRoutes(api), { user: { role: 'viewer' }, path: '/api/posts/1' }).nextCalled, true);
});

test('inside a mounted router it checks baseUrl + path', () => {
  const req = { user: { role: 'viewer' }, method: 'GET', baseUrl: '/api', path: '/posts/1' };
  assert.equal(run(guardRoutes(api), req).nextCalled, true);
});

test('custom getRoles and getPath', () => {
  type Req = { session: { roles: string[] }; originalUrl: string; method: string };
  const mw = guardRoutes(api, {
    getRoles: (req: Req) => req.session.roles,
    getPath: (req: Req) => req.originalUrl,
  });
  const req: Req = { session: { roles: ['viewer'] }, originalUrl: '/api/posts/1?expand=author', method: 'GET' };
  assert.equal(run(mw, req).nextCalled, true);
});

test('a getter picks up rebuilt rules without re-mounting', () => {
  let current = api;
  const mw = guardRoutes(() => current);
  const req = { user: { role: 'viewer' }, method: 'PUT', path: '/api/posts/1' };
  assert.equal(run(mw, req).status, 403);
  current = createRouteAccess({ roles: { viewer: { allow: ['/api/*'] } } });
  assert.equal(run(mw, req).nextCalled, true);
});

test('a "guest" role means no 401, just 403 for closed routes', () => {
  const withGuest = createRouteAccess({ roles: { guest: { allow: ['/api/public/*'] } } });
  const mw = guardRoutes(withGuest, { getRoles: (req: RequestLike) => req.user?.roles ?? 'guest' });
  assert.equal(run(mw, { method: 'GET', path: '/api/public/news' }).nextCalled, true);
  assert.equal(run(mw, { method: 'GET', path: '/api/private' }).status, 403);
});

test('skipMethods lets CORS preflights through, and nothing else', () => {
  const mw = guardRoutes(api, { skipMethods: ['options'] });
  assert.equal(run(mw, { method: 'OPTIONS', path: '/anything' }).nextCalled, true);
  assert.equal(run(mw, { method: 'GET', path: '/anything' }).status, 401);
});

test('by default nothing is skipped, OPTIONS included', () => {
  assert.equal(run(guardRoutes(api), { method: 'OPTIONS', path: '/api/posts/1' }).status, 401);
});

test('a ".." in the request path can not reach a section the role is not allowed into', () => {
  const req = { user: { role: 'viewer' }, method: 'GET', path: '/api/posts/../admin/users' };
  assert.equal(run(guardRoutes(api), req).status, 403);
});

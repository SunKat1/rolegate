import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac, createRouteAccess } from '../src/index.js';
import { guardRoutes, requirePermission } from '../src/express/index.js';
import type { NextLike, RequestLike, ResponseLike } from '../src/express/index.js';

const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write'] } },
  },
});

type Middleware<Req> = (req: Req, res: ResponseLike, next: NextLike) => void;

/** Runs a middleware with a fake response and tells what it did. */
function run<Req>(mw: Middleware<Req>, req: Req) {
  const out: { status?: number; body?: unknown; nextCalled: boolean } = { nextCalled: false };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
  };
  mw(req, res, () => { out.nextCalled = true; });
  return out;
}

test('401 when there is no user', () => {
  const r = run(requirePermission(rbac, 'posts', 'read'), {});
  assert.equal(r.status, 401);
  assert.equal(r.nextCalled, false);
});

test('403 when the role lacks permission', () => {
  const r = run(requirePermission(rbac, 'posts', 'write'), { user: { role: 'viewer' } });
  assert.equal(r.status, 403);
  assert.equal(r.nextCalled, false);
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

test('401 when the role is an empty string', () => {
  const r = run(requirePermission(rbac, 'posts', 'read'), { user: { role: '' } });
  assert.equal(r.status, 401);
  assert.equal(r.nextCalled, false);
});

// ---- guardRoutes ----

const api = createRouteAccess({
  roles: {
    viewer: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    editor: { extends: ['viewer'], allow: [{ path: '/api/posts/:id', methods: ['PUT'] }] },
  },
});

test('guardRoutes: 401 without roles, 403 when the route is not allowed', () => {
  assert.equal(run(guardRoutes(api), { method: 'GET', path: '/api/posts/1' }).status, 401);
  const r = run(guardRoutes(api), { user: { role: 'viewer' }, method: 'PUT', path: '/api/posts/1' });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Forbidden', path: '/api/posts/1', method: 'PUT' });
});

test('guardRoutes: lets allowed requests through', () => {
  assert.equal(run(guardRoutes(api), { user: { role: 'editor' }, method: 'PUT', path: '/api/posts/1' }).nextCalled, true);
});

test('guardRoutes: inside a mounted router it checks baseUrl + path', () => {
  const req = { user: { role: 'viewer' }, method: 'GET', baseUrl: '/api', path: '/posts/1' };
  assert.equal(run(guardRoutes(api), req).nextCalled, true);
});

test('guardRoutes: a getter picks up rebuilt rules without re-mounting', () => {
  let current = api;
  const mw = guardRoutes(() => current);
  const req = { user: { role: 'viewer' }, method: 'PUT', path: '/api/posts/1' };
  assert.equal(run(mw, req).status, 403);
  current = createRouteAccess({ roles: { viewer: { allow: ['/api/*'] } } });
  assert.equal(run(mw, req).nextCalled, true);
});

test('requirePermission: 403 says what was not allowed', () => {
  const r = run(requirePermission(rbac, 'posts', 'write'), { user: { role: 'viewer' } });
  assert.deepEqual(r.body, { error: 'Forbidden', resource: 'posts', action: 'write' });
});

test('requirePermission: a getter picks up a rebuilt rbac', () => {
  let current = rbac;
  const mw = requirePermission(() => current, 'posts', 'delete');
  assert.equal(run(mw, { user: { role: 'editor' } }).status, 403);
  current = createRbac({ roles: { editor: { allow: { posts: ['*'] } } } });
  assert.equal(run(mw, { user: { role: 'editor' } }).nextCalled, true);
});

test('guardRoutes: custom getRoles and getPath', () => {
  type Req = { session: { roles: string[] }; originalUrl: string; method: string };
  const mw = guardRoutes(api, {
    getRoles: (req: Req) => req.session.roles,
    getPath: (req: Req) => req.originalUrl,
  });
  const req: Req = { session: { roles: ['viewer'] }, originalUrl: '/api/posts/1?expand=author', method: 'GET' };
  assert.equal(run(mw, req).nextCalled, true);
});

test('guardRoutes: a request without a method is treated as GET', () => {
  assert.equal(run(guardRoutes(api), { user: { role: 'viewer' }, path: '/api/posts/1' }).nextCalled, true);
});

test('guardRoutes: a "guest" role means no 401, just 403 for closed routes', () => {
  const withGuest = createRouteAccess({ roles: { guest: { allow: ['/api/public/*'] } } });
  const mw = guardRoutes(withGuest, { getRoles: (req: RequestLike) => req.user?.roles ?? 'guest' });
  assert.equal(run(mw, { method: 'GET', path: '/api/public/news' }).nextCalled, true);
  assert.equal(run(mw, { method: 'GET', path: '/api/private' }).status, 403);
});

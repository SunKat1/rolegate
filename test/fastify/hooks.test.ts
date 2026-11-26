// Fastify bindings against a real Fastify app, via app.inject().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { guardRoutes, requirePermission } from '../../src/fastify/index.js';
import { apiAccess, rbac } from '../helpers/fixtures.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: number; roles: string[] } | null;
  }
}

/** A stand-in for real auth: the role comes from a header. */
function makeApp() {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const role = req.headers['x-role'];
    req.user = typeof role === 'string' ? { id: 1, roles: [role] } : null;
  });
  return app;
}

test('requirePermission: 401, 403, and the handler when allowed', async () => {
  const app = makeApp();
  app.delete<{ Params: { authorId: string } }>(
    '/posts/:authorId',
    { preHandler: requirePermission(rbac, 'posts', 'delete', { getContext: (req) => ({ userId: 1, authorId: Number(req.params.authorId) }) }) },
    async () => ({ ok: true }),
  );

  assert.equal((await app.inject({ method: 'DELETE', url: '/posts/1' })).statusCode, 401);
  const forbidden = await app.inject({ method: 'DELETE', url: '/posts/1', headers: { 'x-role': 'viewer' } });
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.json(), { error: 'Forbidden', resource: 'posts', action: 'delete' });
  // the editor may delete only their own post
  assert.equal((await app.inject({ method: 'DELETE', url: '/posts/2', headers: { 'x-role': 'editor' } })).statusCode, 403);
  const ok = await app.inject({ method: 'DELETE', url: '/posts/1', headers: { 'x-role': 'editor' } });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json(), { ok: true });
});

test('guardRoutes: checks the real path and method of every request', async () => {
  const app = makeApp();
  app.addHook('preHandler', guardRoutes(apiAccess, { skipMethods: ['options'] }));
  app.get('/api/posts/:id', async () => 'post');
  app.put('/api/posts/:id', async () => 'saved');
  app.options('/api/posts/:id', async () => 'preflight');

  const as = (role: string | undefined, method: 'GET' | 'PUT' | 'OPTIONS', url: string) =>
    app.inject({ method, url, headers: role ? { 'x-role': role } : {} });

  assert.equal((await as(undefined, 'GET', '/api/posts/1')).statusCode, 401);
  assert.equal((await as('viewer', 'GET', '/api/posts/1?tab=x')).statusCode, 200);
  assert.equal((await as('viewer', 'PUT', '/api/posts/1')).statusCode, 403);
  assert.equal((await as('editor', 'PUT', '/api/posts/1')).statusCode, 200);
  assert.equal((await as(undefined, 'OPTIONS', '/api/posts/1')).statusCode, 200);
});

test('guardRoutes: a path trick still gets the path a server would see', async () => {
  const app = makeApp();
  app.addHook('preHandler', guardRoutes(apiAccess));
  app.get('/*', async () => 'anything');
  const res = await app.inject({ method: 'GET', url: '/api/posts/%2e%2e/%2e%2e/admin', headers: { 'x-role': 'viewer' } });
  assert.equal(res.statusCode, 403);
});

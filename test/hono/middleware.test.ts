// Hono bindings against a real Hono app, via app.request().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { guardRoutes, requirePermission } from '../../src/hono/index.js';
import { apiAccess, rbac } from '../helpers/fixtures.js';

type Env = { Variables: { user?: { id: number; roles: string[] } } };

function makeApp() {
  const app = new Hono<Env>();
  // stand-in auth: the role comes from a header
  app.use('*', async (c, next) => {
    const role = c.req.header('x-role');
    if (role) c.set('user', { id: 1, roles: [role] });
    await next();
  });
  return app;
}

const call = (app: Hono<Env>, method: string, path: string, role?: string) =>
  app.request(path, { method, headers: role ? { 'x-role': role } : {} });

test('requirePermission: 401, 403, and the handler when allowed', async () => {
  const app = makeApp();
  app.delete(
    '/posts/:authorId',
    requirePermission(rbac, 'posts', 'delete', { getContext: (c: Context<Env>) => ({ userId: c.get('user')?.id, authorId: Number(c.req.param('authorId')) }) }),
    (c) => c.json({ ok: true }),
  );

  assert.equal((await call(app, 'DELETE', '/posts/1')).status, 401);
  const forbidden = await call(app, 'DELETE', '/posts/1', 'viewer');
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: 'Forbidden', resource: 'posts', action: 'delete' });
  assert.equal((await call(app, 'DELETE', '/posts/2', 'editor')).status, 403);
  assert.equal((await call(app, 'DELETE', '/posts/1', 'editor')).status, 200);
});

test('guardRoutes: path and method of every request, inside app.route() too', async () => {
  const api = new Hono<Env>();
  api.get('/posts/:id', (c) => c.text('post'));
  api.put('/posts/:id', (c) => c.text('saved'));

  const app = makeApp();
  app.use('/api/*', guardRoutes(apiAccess));
  app.route('/api', api);

  assert.equal((await call(app, 'GET', '/api/posts/1')).status, 401);
  assert.equal((await call(app, 'GET', '/api/posts/1', 'viewer')).status, 200);
  assert.equal((await call(app, 'PUT', '/api/posts/1', 'viewer')).status, 403);
  assert.equal((await call(app, 'PUT', '/api/posts/1', 'editor')).status, 200);
});

test('guardRoutes: skipped methods go straight through', async () => {
  const app = makeApp();
  app.use('*', guardRoutes(apiAccess, { skipMethods: ['OPTIONS'] }));
  app.options('/api/posts/1', (c) => c.text('preflight'));
  assert.equal((await call(app, 'OPTIONS', '/api/posts/1')).status, 200);
});

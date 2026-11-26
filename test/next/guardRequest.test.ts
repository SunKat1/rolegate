// Next.js middleware guard, on plain Fetch API requests (which is what NextRequest extends).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardRequest } from '../../src/next/index.js';
import { apiAccess } from '../helpers/fixtures.js';

const rolesFromHeader = (req: Request) => req.headers.get('x-role') ?? undefined;
const request = (path: string, role?: string, method = 'GET') =>
  new Request(`https://app.test${path}`, { method, headers: role ? { 'x-role': role } : {} });

test('lets allowed requests through by resolving to undefined', async () => {
  const guard = guardRequest(apiAccess, { getRoles: rolesFromHeader });
  assert.equal(await guard(request('/api/posts/1', 'viewer')), undefined);
});

test('answers 401 and 403 as JSON when no redirect is set', async () => {
  const guard = guardRequest(apiAccess, { getRoles: rolesFromHeader });
  assert.equal((await guard(request('/api/posts/1')))?.status, 401);

  const res = await guard(request('/api/posts/1', 'viewer', 'PUT'));
  assert.equal(res?.status, 403);
  assert.deepEqual(await res?.json(), { error: 'Forbidden', path: '/api/posts/1', method: 'PUT' });
});

test('redirects to the login and forbidden pages when they are set', async () => {
  const guard = guardRequest(apiAccess, { getRoles: rolesFromHeader, loginUrl: '/login', forbiddenUrl: '/forbidden' });
  const toLogin = await guard(request('/api/posts/1'));
  assert.equal(toLogin?.status, 307);
  assert.equal(toLogin?.headers.get('location'), 'https://app.test/login');
  assert.equal((await guard(request('/admin', 'viewer')))?.headers.get('location'), 'https://app.test/forbidden');
});

test('never redirects to the page it is already on', async () => {
  // guests can't open /forbidden in these rules, and a redirect there would loop
  const guard = guardRequest(apiAccess, { getRoles: rolesFromHeader, forbiddenUrl: '/forbidden' });
  assert.equal((await guard(request('/Forbidden/', 'guest')))?.status, 403);
});

test('async getRoles, nextUrl and skipped methods', async () => {
  const guard = guardRequest(apiAccess, { getRoles: async () => 'viewer', skipMethods: ['OPTIONS'] });
  const nextLike = Object.assign(request('/ignored'), { nextUrl: { pathname: '/api/posts/9' } });
  assert.equal(await guard(nextLike), undefined);
  assert.equal(await guard(request('/admin', undefined, 'OPTIONS')), undefined);
});

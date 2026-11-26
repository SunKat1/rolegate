// Route Handler wrapper, called the way Next calls it: (request, { params }).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPermission } from '../../src/next/index.js';
import { rbac } from '../helpers/fixtures.js';

type RouteCtx = { params: Promise<{ authorId: string }> };

const DELETE = withPermission(
  rbac,
  'posts',
  'delete',
  {
    getRoles: (req: Request) => req.headers.get('x-role') ?? undefined,
    getContext: async (_req: Request, { params }: RouteCtx) => ({ userId: 1, authorId: Number((await params).authorId) }),
  },
  async (_req, { params }) => Response.json({ deleted: (await params).authorId }),
);

const call = (role: string | undefined, authorId: string) =>
  DELETE(new Request('https://app.test/api/posts', { method: 'DELETE', headers: role ? { 'x-role': role } : {} }), {
    params: Promise.resolve({ authorId }),
  });

test('401 without roles, 403 without permission', async () => {
  assert.equal((await call(undefined, '1')).status, 401);
  const res = await call('viewer', '1');
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Forbidden', resource: 'posts', action: 'delete' });
});

test('runs the handler with its arguments when allowed', async () => {
  assert.equal((await call('editor', '2')).status, 403);
  const res = await call('editor', '1');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: '1' });
});

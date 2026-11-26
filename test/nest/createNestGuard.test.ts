// Nest guard and decorator, with a hand-made ExecutionContext like the one Nest passes in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNestGuard } from '../../src/nest/index.js';
import type { ExecutionContextLike } from '../../src/nest/index.js';
import { apiAccess, rbac } from '../helpers/fixtures.js';

const { RolegateGuard, Permission } = createNestGuard({ rbac });

// Standard decorators here (tsx compiles them). Nest itself uses TypeScript's
// legacy ones, which get their own test below.
class PostsController {
  list() {}

  @Permission('posts', 'write')
  update() {}

  @Permission('posts', 'delete', { getContext: (req) => ({ userId: req.user?.id, authorId: Number(req.params.authorId) }) })
  remove() {}
}

@Permission('posts', 'write')
class AdminController {
  anything() {}
}

function contextFor(cls: Function, handler: Function, req: unknown): ExecutionContextLike {
  return { getHandler: () => handler, getClass: () => cls, switchToHttp: () => ({ getRequest: <T>() => req as T }) };
}

const proto = PostsController.prototype;
const user = (role: string) => ({ user: { id: 1, roles: [role] }, params: { authorId: '1' }, method: 'GET', url: '/' });

test('handlers without @Permission pass', async () => {
  assert.equal(await new RolegateGuard().canActivate(contextFor(PostsController, proto.list, {})), true);
});

test('@Permission on a method: no roles, no access, access', async () => {
  const guard = new RolegateGuard();
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.update, {})), false);
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.update, user('viewer'))), false);
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.update, user('editor'))), true);
});

test('getContext feeds conditional rules', async () => {
  const guard = new RolegateGuard();
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.remove, user('editor'))), true);
  const someoneElses = { ...user('editor'), params: { authorId: '2' } };
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.remove, someoneElses)), false);
});

test('@Permission on a class covers all its handlers', async () => {
  const guard = new RolegateGuard();
  const handler = AdminController.prototype.anything;
  assert.equal(await guard.canActivate(contextFor(AdminController, handler, user('viewer'))), false);
  assert.equal(await guard.canActivate(contextFor(AdminController, handler, user('editor'))), true);
});

test('works with legacy decorators, the way Nest calls them', async () => {
  class Legacy {
    save() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(Legacy.prototype, 'save')!;
  Permission('posts', 'write')(Legacy.prototype, 'save', descriptor);
  const guard = new RolegateGuard();
  assert.equal(await guard.canActivate(contextFor(Legacy, Legacy.prototype.save, user('viewer'))), false);
  assert.equal(await guard.canActivate(contextFor(Legacy, Legacy.prototype.save, user('editor'))), true);
});

test('custom errors, e.g. a real 401', async () => {
  class Unauthorized extends Error {}
  const { RolegateGuard: Guard } = createNestGuard({ rbac, errors: { unauthorized: () => new Unauthorized() } });
  await assert.rejects(new Guard().canActivate(contextFor(PostsController, proto.update, {})), Unauthorized);
});

test('with route rules, every request is checked', async () => {
  const { RolegateGuard: Guard } = createNestGuard({ access: apiAccess });
  const req = (role: string, method: string, originalUrl: string) => ({ user: { roles: [role] }, method, originalUrl });
  const guard = new Guard();
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.list, req('viewer', 'GET', '/api/posts/1?x=1'))), true);
  assert.equal(await guard.canActivate(contextFor(PostsController, proto.list, req('viewer', 'PUT', '/api/posts/1'))), false);
});

test('needs at least one of rbac and access', () => {
  assert.throws(() => createNestGuard({}), /needs `rbac`, `access`, or both/);
});

test('Permission() checks names against the rbac', () => {
  // @ts-expect-error: posts has no "publish"
  Permission('posts', 'publish');
});

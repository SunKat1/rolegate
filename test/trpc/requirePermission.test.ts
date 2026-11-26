// tRPC middleware against a real tRPC router, called through createCaller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTRPC, TRPCError } from '@trpc/server';
import { requirePermission } from '../../src/trpc/index.js';
import { rbac } from '../helpers/fixtures.js';

type AppContext = { user?: { id: number; roles: string[] } };
const t = initTRPC.context<AppContext>().create();

const router = t.router({
  read: t.procedure.use(requirePermission(t, rbac, 'posts', 'read')).query(() => 'post'),
  remove: t.procedure
    .input((raw) => raw as { authorId: number })
    .use(
      requirePermission(t, rbac, 'posts', 'delete', {
        getContext: ({ ctx, input }) => ({ userId: ctx.user?.id, authorId: (input as { authorId: number }).authorId }),
      }),
    )
    .mutation(({ input }) => `deleted ${input.authorId}`),
});

const as = (roles?: string[]) => router.createCaller(roles ? { user: { id: 1, roles } } : {});

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 'OK';
  } catch (err) {
    assert.ok(err instanceof TRPCError);
    return err.code;
  }
}

test('UNAUTHORIZED without roles, FORBIDDEN without permission', async () => {
  assert.equal(await codeOf(as().read()), 'UNAUTHORIZED');
  assert.equal(await codeOf(as(['viewer']).remove({ authorId: 1 })), 'FORBIDDEN');
});

test('runs the procedure when allowed, conditions get the input', async () => {
  assert.equal(await as(['viewer']).read(), 'post');
  assert.equal(await codeOf(as(['editor']).remove({ authorId: 2 })), 'FORBIDDEN');
  assert.equal(await as(['editor']).remove({ authorId: 1 }), 'deleted 1');
});

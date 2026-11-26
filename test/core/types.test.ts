// Type-level checks. The real test is `npm run typecheck`: every @ts-expect-error
// below must be an actual error, or tsc complains that it's unused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';
import type { Rbac, RbacConfig } from '../../src/index.js';
import { requirePermission } from '../../src/express/index.js';

const isOwner = (c: { userId?: string; ownerId?: string }) => c.userId !== undefined && c.userId === c.ownerId;

const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'], comments: ['read'] } },
    author: { extends: ['viewer'], allow: { posts: ['create', { action: 'delete', when: isOwner }] } },
    support: { allow: { billing: ['read'] }, deny: { billing: ['refund'] } },
  },
});

test('resource and action names come from the config', () => {
  assert.equal(rbac.can('author', 'posts', 'create'), true);
  assert.equal(rbac.can('author', 'posts', 'delete', { userId: 'a', ownerId: 'a' }), true);
  assert.equal(rbac.can('support', 'billing', 'refund'), false);

  // @ts-expect-error: no such resource
  rbac.can('author', 'psots', 'read');
  // @ts-expect-error: posts has no "publish" action
  rbac.can('author', 'posts', 'publish');
  // @ts-expect-error: the context is the one isOwner asks for
  rbac.can('author', 'posts', 'delete', { userId: 1 });
});

test("with '*' as a resource the names can't be known, so any string goes", () => {
  const withAdmin = createRbac({
    roles: {
      viewer: { allow: { posts: ['read'] } },
      admin: { allow: { '*': ['*'] } },
    },
  });
  // billing isn't named anywhere, but admin covers it, so this has to compile
  assert.equal(withAdmin.can('admin', 'billing', 'refund'), true);
});

test("with '*' as an action, that resource takes any action name", () => {
  const typed = createRbac({ roles: { owner: { allow: { posts: ['*'] } }, viewer: { allow: { posts: ['read'] } } } });
  assert.equal(typed.can('owner', 'posts', 'archive'), true);
  // @ts-expect-error: the resource names are still known
  typed.can('owner', 'comments', 'read');
});

test('a declared resources list is what the types follow', () => {
  const typed = createRbac({
    resources: { posts: ['read', 'publish'] },
    roles: { editor: { allow: { posts: ['read'] } } },
  });
  // publish isn't granted to anyone yet, but it's a known action, so it type-checks
  assert.equal(typed.can('editor', 'posts', 'publish'), false);
  // @ts-expect-error: not in resources
  typed.can('editor', 'comments', 'read');
});

test('a config typed as RbacConfig (e.g. from JSON) stays plain strings', () => {
  const fromJson: RbacConfig = { roles: { a: { allow: { posts: ['read'] } } } };
  const loose = createRbac(fromJson);
  assert.equal(loose.can('a', 'anything', 'goes'), false);
});

test('the older createRbac<Ctx>() form still works', () => {
  const old = createRbac<{ userId?: number }>({
    roles: { a: { allow: { posts: [{ action: 'edit', when: (c) => c.userId === 1 }] } } },
  });
  assert.equal(old.can('a', 'whatever', 'edit', { userId: 1 }), false);
  assert.equal(old.can('a', 'posts', 'edit', { userId: 1 }), true);
});

test('a typed rbac fits where a plain Rbac is expected', () => {
  const plain: Rbac = rbac;
  assert.equal(plain.can('viewer', 'posts', 'read'), true);
});

test('requirePermission checks names against the rbac', () => {
  requirePermission(rbac, 'comments', 'read');
  // @ts-expect-error: comments has no "create"
  requirePermission(rbac, 'comments', 'create');
});

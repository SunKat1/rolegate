// The optional `resources` list: typos in rules throw on startup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';
import type { RbacConfig } from '../../src/index.js';

const resources = { posts: ['read', 'write'], comments: ['read'] };
const build = (roles: RbacConfig['roles'], res: unknown = resources) => () =>
  createRbac({ resources: res, roles } as RbacConfig);

test('rules that match the list are fine', () => {
  const rbac = build({ a: { allow: { posts: ['read', 'write'], '*': ['read'] }, deny: { comments: ['*'] } } })();
  assert.equal(rbac.can('a', 'posts', 'write'), true);
});

test('an unknown resource or action throws', () => {
  assert.throws(build({ a: { allow: { psots: ['read'] } } }), /unknown resource "psots"/);
  assert.throws(build({ a: { deny: { posts: ['wirte'] } } }), /has no action "wirte".*deny of role "a"/);
  assert.throws(build({ a: { allow: { '*': ['publish'] } } }), /no resource has the action "publish"/);
});

test('the list itself is checked', () => {
  assert.throws(build({}, []), /config.resources should be an object/);
  assert.throws(build({}, { posts: [] }), /non-empty list/);
  assert.throws(build({}, { posts: ['*'] }), /non-empty list/);
  assert.throws(build({}, { '*': ['read'] }), /can't be a resource name/);
});

// createRbac with configs that are broken in some way. All of these must
// fail when the checker is built, never in the middle of a request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac } from '../../src/index.js';

const build = (roles: unknown) => () => createRbac({ roles } as never);

test('unknown roles in extends and circular extends', () => {
  assert.throws(build({ a: { extends: ['missing'] } }), /unknown role "missing"/);
  assert.throws(build({ a: { extends: ['b'] }, b: { extends: ['a'] } }), /circular/);
  // names that live on Object.prototype are not secretly roles
  assert.throws(build({ a: { extends: ['toString'] } }), /unknown role "toString"/);
});

test('the roles object and each role have to be objects', () => {
  assert.throws(build(undefined), /config\.roles should be an object/);
  assert.throws(build({ a: 'admin' }), /role "a" should be an object/);
  assert.throws(build({ a: { extends: 'b' } }), /"extends" of role "a"/);
});

test('allow and deny have to look like { resource: [rules] }', () => {
  assert.throws(build({ a: { allow: ['read'] } }), /allow of role "a" should be an object/);
  assert.throws(build({ a: { allow: { posts: 'read' } } }), /rules for "posts" should be a list/);
});

test('every rule is an action name or { action, when? }', () => {
  assert.throws(build({ a: { allow: { posts: [{ act: 'read' }] } } }), /action name or \{ action, when\? \}/);
  assert.throws(
    build({ a: { deny: { posts: [{ action: 'read', when: true }] } } }),
    /"when" should be a function or an object .*action "read"/,
  );
});

test('"__proto__" is refused as a role name', () => {
  assert.throws(build(JSON.parse('{"__proto__": {"allow": {"*": ["*"]}}}')), /"__proto__" can't be used as a role name/);
});

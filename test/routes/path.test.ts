// How request paths are read before any rule sees them, and the tricks
// people use to get around a check: "..", percent-encoding, odd casing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess, normalizePath } from '../../src/index.js';

const pages = createRouteAccess({
  roles: {
    user: { allow: ['/public/*', '/files/:name'], deny: ['/public/secret'] },
  },
});

test('the query, hash, slashes and case are ignored', () => {
  assert.equal(normalizePath('/Posts/42/?tab=comments#top'), '/posts/42');
  assert.equal(normalizePath('//admin//users'), '/admin/users');
  assert.equal(normalizePath('posts/'), '/posts');
  assert.equal(normalizePath(''), '/');
});

test('"." and ".." are resolved, and never climb above the root', () => {
  assert.equal(normalizePath('/public/./a/../b'), '/public/b');
  assert.equal(normalizePath('/../../etc'), '/etc');
});

test('broken percent-encoding never makes normalizePath throw', () => {
  assert.equal(normalizePath('/a/%zz'), '/a/%zz');
});

test('".." can not walk out of an allowed section', () => {
  // express.static and proxies resolve these to /admin/..., so we must too
  assert.equal(pages.can('user', '/public/../admin/secret.html'), false);
  assert.equal(pages.can('user', '/public/%2e%2e/admin/secret.html'), false);
  assert.equal(pages.can('user', '/public/%2E%2E%2Fadmin'), false);
  assert.equal(pages.can('user', '/public/..%5Cadmin'), false);
});

test('walking around inside an allowed section is still fine', () => {
  assert.equal(pages.can('user', '/public/a/../b'), true);
  assert.equal(pages.can('user', '/public/./a'), true);
});

test('encoding or casing can not dodge a deny', () => {
  assert.equal(pages.can('user', '/public/secret'), false);
  assert.equal(pages.can('user', '/public/%73ecret'), false);
  assert.equal(pages.can('user', '/public/SECRET'), false);
  assert.equal(pages.can('user', '/public/x/../secret'), false);
});

test('an encoded slash counts as a real one', () => {
  // ":name" is a single segment, and "a%2Fb" is two once decoded
  assert.equal(pages.can('user', '/files/report.pdf'), true);
  assert.equal(pages.can('user', '/files/a%2Fb'), false);
});

test('a path with broken percent-encoding is always denied', () => {
  assert.equal(pages.can('user', '/public/%zz'), false);
  const everything = createRouteAccess({ roles: { all: { allow: ['*'] } } });
  assert.equal(everything.can('all', '/%E0%A4%A'), false);
});

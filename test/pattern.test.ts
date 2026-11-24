import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, normalizePath } from '../src/routes/pattern.js';

const matches = (pattern: string, path: string) => compilePattern(pattern).test(path);

test('plain paths match exactly', () => {
  assert.equal(matches('/settings', '/settings'), true);
  assert.equal(matches('/settings', '/settings/profile'), false);
  assert.equal(matches('/', '/'), true);
  assert.equal(matches('/', '/anything'), false);
});

test(':params match one non-empty segment', () => {
  assert.equal(matches('/posts/:id', '/posts/42'), true);
  assert.equal(matches('/posts/:id', '/posts'), false);
  assert.equal(matches('/posts/:id', '/posts/42/edit'), false);
  assert.equal(matches('/posts/:id/edit', '/posts/42/edit'), true);
});

test('a trailing * covers the section itself and everything below', () => {
  assert.equal(matches('/admin/*', '/admin'), true);
  assert.equal(matches('/admin/*', '/admin/users/7'), true);
  assert.equal(matches('/admin/*', '/administrator'), false);
  assert.equal(matches('*', '/whatever/you/like'), true);
});

test('paths are compared the way routers see them', () => {
  // query and hash are ignored, trailing and double slashes too, and case doesn't matter
  assert.equal(matches('/posts/:id', '/posts/42?tab=comments#top'), true);
  assert.equal(matches('/admin/users', '/admin/users/'), true);
  assert.equal(matches('/admin/users', '//admin//users'), true);
  assert.equal(matches('/admin/*', '/ADMIN/Users'), true);
  assert.equal(normalizePath('posts/'), '/posts');
});

test('patterns we do not support fail loudly', () => {
  assert.throws(() => compilePattern('admin'), /should start with/);
  assert.throws(() => compilePattern('/a/*/b'), /only allowed as the last segment/);
  assert.throws(() => compilePattern('/a*'), /only allowed as the last segment/);
  assert.throws(() => compilePattern('/posts/:id(\\d+)'), /not a valid parameter/);
  assert.throws(() => compilePattern('/posts?x=1'), /query strings/);
});

test('"/*" covers the root as well', () => {
  assert.equal(matches('/*', '/'), true);
  assert.equal(matches('/*', '/deep/down'), true);
});

test('an empty path is the root', () => {
  assert.equal(normalizePath(''), '/');
  assert.equal(matches('/', ''), true);
});

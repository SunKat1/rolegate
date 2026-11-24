// routeConfigFromRows: turning rows from a "who can open what" table into a config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteAccess, routeConfigFromRows } from '../../src/index.js';

test('rows from a database turn into a working config', () => {
  const rows = [
    { role: 'user', path: '/dashboard', method: null, effect: null },
    { role: 'user', path: '/posts/:id', method: 'GET' },
    { role: 'admin', path: '/admin/*' },
    { role: 'admin', path: '/admin/billing', effect: 'deny' as const },
  ];
  const access = createRouteAccess(routeConfigFromRows(rows, { extends: { admin: ['user'] } }));
  assert.equal(access.can('user', '/dashboard'), true);
  assert.equal(access.can('user', '/posts/5', 'DELETE'), false);
  assert.equal(access.can('admin', '/posts/5'), true);
  assert.equal(access.can('admin', '/admin/billing'), false);
});

test('a row with a method allows only that method', () => {
  const access = createRouteAccess(routeConfigFromRows([{ role: 'r', path: '/api/x', method: 'post' }]));
  assert.equal(access.can('r', '/api/x', 'POST'), true);
  assert.equal(access.can('r', '/api/x', 'GET'), false);
});

test('a role with only "extends" and no rules of its own still works', () => {
  const config = routeConfigFromRows([{ role: 'user', path: '/home' }], { extends: { manager: ['user'] } });
  assert.deepEqual(config.roles.manager, { extends: ['user'] });
  assert.equal(createRouteAccess(config).can('manager', '/home'), true);
});

test('the extends lists are copied, not shared', () => {
  const parents = { admin: ['user'] };
  const config = routeConfigFromRows([{ role: 'user', path: '/' }], { extends: parents });
  config.roles.admin.extends!.push('hacker');
  assert.deepEqual(parents.admin, ['user']);
});

test('roles named like Object.prototype members are just roles', () => {
  const access = createRouteAccess(routeConfigFromRows([{ role: 'constructor', path: '/a' }]));
  assert.equal(access.can('constructor', '/a'), true);
});

test('broken rows fail with the role and path in the message', () => {
  assert.throws(() => routeConfigFromRows([{ role: 'x', path: '/', effect: 'maybe' as never }]), /unknown effect/);
  assert.throws(() => routeConfigFromRows([{ role: '', path: '/x' }]), /non-empty strings/);
  assert.throws(() => routeConfigFromRows([{ role: 'a', path: 5 as never }]), /"path" should be a string \(row for role "a"/);
  assert.throws(() => routeConfigFromRows([{ role: 'a', path: '/x', method: 1 as never }]), /"method" should be a string/);
});

test('a "__proto__" row can not leak its routes into every role', () => {
  // Before the fix this row wrote "allow" into Object.prototype, and then
  // every role without an allow list of its own could open /admin.
  const rows = [
    { role: 'viewer', path: '/blocked', effect: 'deny' as const },
    { role: '__proto__', path: '/admin/*' },
  ];
  assert.throws(() => routeConfigFromRows(rows), /"__proto__" can't be used as a role name/);
  assert.equal(({} as Record<string, unknown>).allow, undefined);
});

test('"__proto__" is refused in options.extends too', () => {
  const parents = JSON.parse('{"__proto__": ["user"]}');
  assert.throws(() => routeConfigFromRows([], { extends: parents }), /__proto__/);
});

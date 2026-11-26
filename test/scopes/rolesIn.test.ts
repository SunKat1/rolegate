// Roles per organization: admin in one, viewer in another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRbac, rolesIn } from '../../src/index.js';

const memberships = { 'org-1': ['admin'], 'org-2': 'viewer', '*': ['support'] };

test('roles of one scope plus the ones that count everywhere', () => {
  assert.deepEqual(rolesIn(memberships, 'org-1'), ['admin', 'support']);
  assert.deepEqual(rolesIn(memberships, 'org-2'), ['viewer', 'support']);
});

test('an unknown or missing scope gives only the global roles', () => {
  assert.deepEqual(rolesIn(memberships, 'org-3'), ['support']);
  assert.deepEqual(rolesIn(memberships, undefined), ['support']);
  assert.deepEqual(rolesIn({ 'org-1': ['admin'] }, ''), []);
  assert.deepEqual(rolesIn(null, 'org-1'), []);
});

test('rows from a memberships table and Maps work too', () => {
  const rows = [
    { scope: 'org-1', role: 'admin' },
    { scope: 'org-2', role: 'viewer' },
    { scope: 'org-1', role: 'admin' },
  ];
  assert.deepEqual(rolesIn(rows, 'org-1'), ['admin']);
  assert.deepEqual(rolesIn(new Map([['org-2', ['viewer']]]), 'org-2'), ['viewer']);
});

test('scope names that look like Object.prototype members are just scopes', () => {
  assert.deepEqual(rolesIn({}, 'constructor'), []);
  assert.deepEqual(rolesIn({}, '__proto__'), []);
});

test('nothing leaks from one organization into another', () => {
  const rbac = createRbac({
    resources: { invoices: ['read', 'delete'] },
    roles: { admin: { allow: { invoices: ['*'] } }, viewer: { allow: { invoices: ['read'] } }, support: {} },
  });
  assert.equal(rbac.can(rolesIn(memberships, 'org-1'), 'invoices', 'delete'), true);
  assert.equal(rbac.can(rolesIn(memberships, 'org-2'), 'invoices', 'delete'), false);
});

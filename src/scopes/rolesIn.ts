// Roles that depend on where you are: admin in one organization, viewer in
// another. rolegate's checks take a plain list of roles, so all we need is a
// way to pick the right list for the current organization (or team, project...).

import type { Roles } from '../shared/roles.js';
import { roleNames } from '../shared/roles.js';

/** Roles that count everywhere, like a platform-wide support role. */
export const ANY_SCOPE = '*';

/** One row from a memberships table: this user has `role` in `scope`. */
export interface ScopedRole {
  scope: string;
  role: string;
}

/**
 * Where a user's roles per scope come from. Any of these work:
 *
 *   { 'org-1': ['admin'], 'org-2': 'viewer', '*': ['support'] }
 *   new Map([['org-1', ['admin']]])
 *   [{ scope: 'org-1', role: 'admin' }, { scope: 'org-2', role: 'viewer' }]
 */
export type ScopedRoles = Readonly<Record<string, Roles>> | ReadonlyMap<string, Roles> | Iterable<ScopedRole>;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * The roles a user has in one scope, plus the ones they have everywhere ('*'):
 *
 *   const roles = rolesIn(user.memberships, req.params.orgId);
 *   rbac.can(roles, 'invoices', 'read');
 *
 * An unknown or missing scope gives only the '*' roles. Nothing leaks from
 * one organization into another.
 */
export function rolesIn(assignments: ScopedRoles | null | undefined, scope: string | null | undefined): string[] {
  const found = new Set<string>();
  if (!assignments) return [];

  const wanted = typeof scope === 'string' && scope !== '' ? [scope, ANY_SCOPE] : [ANY_SCOPE];

  if (assignments instanceof Map) {
    for (const key of wanted) for (const role of roleNames(assignments.get(key))) found.add(role);
  } else if (isIterable(assignments)) {
    for (const row of assignments) {
      if (row && wanted.includes(row.scope) && typeof row.role === 'string' && row.role !== '') found.add(row.role);
    }
  } else {
    // own keys only, a scope called "constructor" is just a scope
    const byScope = assignments as Record<string, Roles>;
    for (const key of wanted) {
      if (!hasOwn(byScope, key)) continue;
      for (const role of roleNames(byScope[key])) found.add(role);
    }
  }
  return [...found];
}

function isIterable(value: object): value is Iterable<ScopedRole> {
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

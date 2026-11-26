// explain(): the same decision as can(), but with the reason attached.
// Handy for logs and for "why do I get a 403?" moments.

import { roleNames } from './roles.js';
import type { Roles } from './roles.js';

export type DecisionReason =
  | 'allowed' // some role allows it, none denies it
  | 'denied' // a deny rule matched
  | 'no-match' // the user has known roles, but no rule allows it
  | 'no-roles'; // none of the user's roles are in the config

export interface Decision<R> {
  allowed: boolean;
  reason: DecisionReason;
  /** The user's role whose rule decided it. */
  role?: string;
  /** The rule that decided it. It may come from a role this one extends. */
  rule?: R;
  /** Roles the user has that aren't in the config. Often a typo or a stale token. */
  unknownRoles: string[];
  /** One line for the logs. */
  message: string;
}

export interface ExplainParts<T, R> {
  known: Map<string, T>;
  roles: Roles;
  findDeny: (role: T) => R | undefined;
  findAllow: (role: T) => R | undefined;
  /** "write on posts", "GET /posts/42" */
  subject: string;
  describe: (rule: R) => string;
}

/** Walks the roles the same way decide() does, but remembers who decided. */
export function explain<T, R>({ known, roles, findDeny, findAllow, subject, describe }: ExplainParts<T, R>): Decision<R> {
  const names = roleNames(roles);
  const picked = names.filter((name) => known.has(name));
  const unknownRoles = names.filter((name) => !known.has(name));

  if (picked.length === 0) {
    const got = names.length ? `got ${names.map((n) => `"${n}"`).join(', ')}` : 'no roles at all';
    return { allowed: false, reason: 'no-roles', unknownRoles, message: `denied ${subject}: no known roles (${got})` };
  }

  // deny first, any role: same order as decide()
  for (const role of picked) {
    const rule = findDeny(known.get(role)!);
    if (rule) return { allowed: false, reason: 'denied', role, rule, unknownRoles, message: `denied ${subject}: ${describe(rule)}` };
  }
  for (const role of picked) {
    const rule = findAllow(known.get(role)!);
    if (rule) return { allowed: true, reason: 'allowed', role, rule, unknownRoles, message: `allowed ${subject}: ${describe(rule)}` };
  }

  const list = picked.map((n) => `"${n}"`).join(', ');
  return { allowed: false, reason: 'no-match', unknownRoles, message: `denied ${subject}: no rule of ${list} allows it` };
}

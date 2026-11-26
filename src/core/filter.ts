// rbac.filter(): "which posts may this user update?" as a database filter.
//
// It's the same decision as can(), just with the record left open: context
// keys you pass get filled in, and the condition fields you didn't pass
// become column checks. So `{ authorId: { ref: 'userId' } }` with
// `{ userId: 7 }` turns into `authorId = 7`.

import { and, not, or } from '../filters/filter.js';
import type { Filter } from '../filters/filter.js';
import { isRef, readField, readRef } from './conditions/where.js';
import type { Where } from './conditions/where.js';
import { candidates } from './rules.js';
import type { Entry, RuleIndex } from './rules.js';
import type { Context } from './types.js';

export interface FilterRole<C extends Context> {
  allow: RuleIndex<C>;
  deny: RuleIndex<C>;
}

export function buildFilter<C extends Context>(
  roles: FilterRole<C>[],
  resource: string,
  action: string,
  ctx: object,
): Filter {
  if (roles.length === 0) return false;

  const side = (pick: (role: FilterRole<C>) => RuleIndex<C>) =>
    or(roles.flatMap((role) => [...candidates(pick(role), resource, action)].map((entry) => entryFilter(entry, ctx))));

  // allowed by some role, and denied by none: decide() in filter form
  return and([side((r) => r.allow), not(side((r) => r.deny))]);
}

function entryFilter<C extends Context>(entry: Entry<C>, ctx: object): Filter {
  if (entry.when === undefined) return true;
  if (typeof entry.when === 'function') {
    throw new Error(
      `rolegate: can't turn the condition of ${entry.effect} "${entry.action}" on "${entry.resource}" ` +
        `(role "${entry.role}") into a filter, it's a function. Write it as an object like { authorId: { ref: 'userId' } }.`,
    );
  }
  return whereFilter(entry.when, ctx);
}

function whereFilter(where: Where, ctx: object): Filter {
  return and(
    Object.entries(where).map(([field, expected]): Filter => {
      // a field we were given is just a yes or no, same as in can()
      const known = readField(ctx, field);
      if (known !== undefined) {
        if (isRef(expected)) return known === readRef(ctx, expected);
        return Array.isArray(expected) ? expected.includes(known) : known === expected;
      }

      // anything else is a column in the table
      if (isRef(expected)) {
        const value = readRef(ctx, expected);
        // no user id means no rows, not "rows where authorId IS NULL"
        return value === undefined ? false : { field, eq: value };
      }
      return Array.isArray(expected) ? { field, in: expected } : { field, eq: expected };
    }),
  );
}

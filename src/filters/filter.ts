// What `rbac.filter()` returns: "which records may this user touch", as a small
// tree that doesn't know about any database. toPrisma() and toSql() turn it
// into something your ORM or driver understands.

import type { Scalar } from '../core/conditions/where.js';

export type Filter =
  | boolean // true: every record, false: none
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter }
  | { field: string; eq: unknown }
  | { field: string; in: readonly Scalar[] };

// The builders below simplify as they go, so a role with a plain allow gives
// `true` and not a pile of nested ORs with a true somewhere inside.

export function and(parts: Filter[]): Filter {
  const kept: Filter[] = [];
  for (const part of parts) {
    if (part === false) return false;
    if (part !== true) kept.push(part);
  }
  if (kept.length === 0) return true;
  return kept.length === 1 ? kept[0] : { and: kept };
}

export function or(parts: Filter[]): Filter {
  const kept: Filter[] = [];
  for (const part of parts) {
    if (part === true) return true;
    if (part !== false) kept.push(part);
  }
  if (kept.length === 0) return false;
  return kept.length === 1 ? kept[0] : { or: kept };
}

export function not(part: Filter): Filter {
  if (typeof part === 'boolean') return !part;
  return 'not' in part ? part.not : { not: part };
}

import type { Filter } from './filter.js';

export type PrismaWhere = Record<string, unknown>;

/**
 * Turns a filter into a Prisma `where`:
 *
 *   prisma.post.findMany({ where: toPrisma(rbac.filter(roles, 'posts', 'update', { userId })) });
 *
 * `true` becomes `{}` (everything) and `false` becomes `{ OR: [] }`,
 * which is how Prisma spells "nothing".
 */
export function toPrisma(filter: Filter): PrismaWhere {
  if (filter === true) return {};
  if (filter === false) return { OR: [] };
  if ('and' in filter) return { AND: filter.and.map(toPrisma) };
  if ('or' in filter) return { OR: filter.or.map(toPrisma) };
  if ('not' in filter) return { NOT: toPrisma(filter.not) };
  if ('in' in filter) return { [filter.field]: { in: filter.in } };
  return { [filter.field]: filter.eq };
}

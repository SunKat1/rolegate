import type { Filter } from './filter.js';

export interface SqlOptions {
  /** How a parameter looks. `?` by default; for Postgres pass `(i) => '$' + i`. */
  placeholder?: (index: number) => string;
  /** Number of the first parameter, if your query already has some. Starts at 1. */
  firstIndex?: number;
  /** How a column name is quoted. `"name"` by default; for MySQL pass `` (c) => `\`${c}\`` ``. */
  quote?: (column: string) => string;
}

export interface SqlWhere {
  sql: string;
  params: unknown[];
}

/**
 * Turns a filter into a parameterized SQL condition:
 *
 *   const { sql, params } = toSql(rbac.filter(roles, 'posts', 'update', { userId }));
 *   db.query(`SELECT * FROM posts WHERE ${sql}`, params);
 *
 * Values always go into `params`, never into the string. Column names are
 * checked when the config is created (letters, digits and _ only), so they're
 * safe to put in the query.
 */
export function toSql(filter: Filter, options: SqlOptions = {}): SqlWhere {
  const placeholder = options.placeholder ?? (() => '?');
  const quote = options.quote ?? ((c: string) => `"${c}"`);
  const params: unknown[] = [];
  let index = options.firstIndex ?? 1;

  const param = (value: unknown) => {
    params.push(value);
    return placeholder(index++);
  };

  const build = (f: Filter): string => {
    // 1=1 and 1=0 work everywhere, TRUE and FALSE don't (hello, SQL Server)
    if (f === true) return '1=1';
    if (f === false) return '1=0';
    if ('and' in f) return `(${f.and.map(build).join(' AND ')})`;
    if ('or' in f) return `(${f.or.map(build).join(' OR ')})`;
    if ('not' in f) return `NOT ${build(f.not)}`;

    const column = quote(f.field);
    if ('in' in f) {
      // NULL never matches IN (...), so it needs its own IS NULL
      const values = f.in.filter((v) => v !== null);
      const inList = values.length ? `${column} IN (${values.map(param).join(', ')})` : '';
      if (values.length === f.in.length) return inList;
      return inList ? `(${inList} OR ${column} IS NULL)` : `${column} IS NULL`;
    }
    return f.eq === null ? `${column} IS NULL` : `${column} = ${param(f.eq)}`;
  };

  return { sql: build(filter), params };
}

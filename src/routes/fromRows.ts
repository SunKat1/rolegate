import { checkRoleName, configError, dictionary, isObject } from '../shared/validate.js';
import type { RouteAccessConfig, RouteRoleConfig } from './types.js';

/**
 * One row from a "who can open what" table. Column names are up to you:
 * map your rows to this shape and you're done.
 */
export interface RouteRow {
  role: string;
  path: string;
  /** Leave empty to mean "any method", which is the usual case for pages. */
  method?: string | null;
  /** Defaults to 'allow'. */
  effect?: 'allow' | 'deny' | null;
}

export interface FromRowsOptions {
  /** Role inheritance, if you keep it somewhere too: `{ admin: ['editor'] }`. */
  extends?: Record<string, string[]>;
}

/**
 * Turns flat table rows into a config for `createRouteAccess`.
 *
 *   const rows = await db.query('SELECT role, path, method, effect FROM route_permissions');
 *   const access = createRouteAccess(routeConfigFromRows(rows));
 *
 * It doesn't check the patterns itself. `createRouteAccess` does that and
 * tells you which role has the broken one.
 */
export function routeConfigFromRows(rows: Iterable<RouteRow>, options: FromRowsOptions = {}): RouteAccessConfig {
  // No prototype here: with a plain {} a row with role "__proto__" would
  // return Object.prototype from roles[name] and we'd write its routes into
  // every object in the app. checkRoleName refuses that name anyway, this is
  // the second lock on the same door.
  const roles = dictionary<RouteRoleConfig>();
  const roleFor = (name: string, where: string) => {
    checkRoleName(name, where);
    return (roles[name] ??= {});
  };

  for (const row of rows) {
    const where = `row for role "${row?.role}" on "${row?.path}"`;
    if (!isObject(row)) configError('every row should be an object like { role, path }');
    if (typeof row.path !== 'string') configError(`"path" should be a string (${where})`);
    if (row.method != null && typeof row.method !== 'string') configError(`"method" should be a string (${where})`);

    const effect = row.effect ?? 'allow';
    if (effect !== 'allow' && effect !== 'deny') configError(`unknown effect "${effect}" (${where})`);

    const role = roleFor(row.role, where);
    const list = (role[effect] ??= []);
    list.push(row.method ? { path: row.path, methods: [row.method] } : row.path);
  }

  for (const [name, parents] of Object.entries(options.extends ?? {})) {
    if (!Array.isArray(parents)) configError(`parents of role "${name}" should be a list`);
    roleFor(name, 'in options.extends').extends = [...parents];
  }

  return { roles };
}

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
  const roles: Record<string, RouteRoleConfig> = {};
  const roleFor = (name: string) => (roles[name] ??= {});

  for (const row of rows) {
    const effect = row.effect ?? 'allow';
    if (effect !== 'allow' && effect !== 'deny') {
      throw new Error(`rolegate: unknown effect "${effect}" for role "${row.role}" on "${row.path}"`);
    }
    const role = roleFor(row.role);
    const list = (role[effect] ??= []);
    list.push(row.method ? { path: row.path, methods: [row.method] } : row.path);
  }

  for (const [name, parents] of Object.entries(options.extends ?? {})) {
    roleFor(name).extends = [...parents];
  }

  return { roles };
}

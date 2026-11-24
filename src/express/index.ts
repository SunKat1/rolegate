// Express bindings. Express itself isn't a dependency: any framework with
// (req, res, next) and res.status().json() will work.

// One resource, one action, mounted on a specific route.
export { requirePermission } from './requirePermission.js';
export type { RequirePermissionOptions } from './requirePermission.js';

// A single guard for a whole bunch of routes, driven by route rules.
export { guardRoutes } from './guardRoutes.js';
export type { GuardRoutesOptions } from './guardRoutes.js';

export type { RequestLike, ResponseLike, NextLike, Source } from './types.js';

// Fastify bindings. Fastify itself isn't a dependency: these are plain async
// hooks that fit `preHandler` and `onRequest`.

export { requirePermission, guardRoutes } from './hooks.js';
export type { RequirePermissionOptions, GuardRoutesOptions } from './hooks.js';
export type { FastifyRequestLike, FastifyReplyLike } from './types.js';

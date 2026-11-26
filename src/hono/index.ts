// Hono bindings. Hono itself isn't a dependency. Works on every runtime Hono
// runs on: Node, Bun, Deno, Cloudflare Workers.

export { requirePermission, guardRoutes } from './middleware.js';
export type { RequirePermissionOptions, GuardRoutesOptions, HonoContextLike, HonoNext } from './middleware.js';

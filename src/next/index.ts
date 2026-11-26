// Next.js bindings. Next itself isn't a dependency: these work with the
// standard Request and Response, so the same code runs in middleware, in
// Route Handlers, on the Edge runtime and in anything else built on Fetch.
//
// Server Components and Server Actions don't need a binding: call
// rbac.assert() or access.can() there directly.

// Middleware / proxy: one guard for all pages and API routes.
export { guardRequest } from './guardRequest.js';
export type { GuardRequestOptions, FetchRequestLike } from './guardRequest.js';

// Route Handlers: one action per handler.
export { withPermission } from './withPermission.js';
export type { WithPermissionOptions } from './withPermission.js';

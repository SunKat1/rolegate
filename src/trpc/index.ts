// tRPC bindings. Unlike the others, this one imports @trpc/server (an optional
// peer dependency), because tRPC only understands errors that are TRPCError.

export { requirePermission } from './requirePermission.js';
export type { RequirePermissionOptions } from './requirePermission.js';

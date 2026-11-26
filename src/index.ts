// Everything that doesn't depend on a framework lives here.
// Framework bindings have their own entry points: rolegate/express, rolegate/react,
// rolegate/next, rolegate/fastify, rolegate/hono, rolegate/nest and rolegate/trpc.

// Checking actions on resources: "can an editor delete posts?"
export * from './core/index.js';

// Checking routes and pages: "can an editor open /admin/users?"
export * from './routes/index.js';

// "Which posts may this user edit?" as a Prisma or SQL filter
export * from './filters/index.js';

// Roles per organization, team or project
export * from './scopes/index.js';

export { ForbiddenError } from './shared/errors.js';
export type { Roles } from './shared/roles.js';
export type { Decision, DecisionReason } from './shared/decision.js';

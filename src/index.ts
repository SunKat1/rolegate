// Everything that doesn't depend on a framework lives here.
// Express and React bindings have their own entry points: rolegate/express and rolegate/react.

// Checking actions on resources: "can an editor delete posts?"
export * from './core/index.js';

// Checking routes and pages: "can an editor open /admin/users?"
export * from './routes/index.js';

export { ForbiddenError } from './shared/errors.js';
export type { Roles } from './shared/roles.js';

// React bindings. These are for the UI only: hiding buttons and links the user
// can't use anyway. The real check always has to happen on the server too.

// Actions on resources: <Can resource="posts" action="delete">
export { RbacProvider, useCan, Can } from './rbac.js';
export type { RbacProviderProps, CanProps } from './rbac.js';

// Pages: <CanVisit path="/admin">
export { RouteAccessProvider, useCanVisit, CanVisit } from './routes.js';
export type { RouteAccessProviderProps, CanVisitProps } from './routes.js';

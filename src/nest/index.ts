// NestJS bindings. @nestjs/common isn't a dependency: the guard is a plain
// class with canActivate(), and the decorator keeps its data in a WeakMap.

export { createNestGuard } from './createNestGuard.js';
export type { NestGuardOptions, PermissionOptions, ExecutionContextLike } from './createNestGuard.js';

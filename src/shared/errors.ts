/**
 * Thrown by `assert()` in both engines.
 *
 * For resource checks it reads like "cannot delete posts",
 * for route checks like "cannot DELETE /posts/42".
 */
export class ForbiddenError extends Error {
  readonly resource: string;
  readonly action: string;

  constructor(resource: string, action: string) {
    super(`Forbidden: cannot ${action} ${resource}`);
    this.name = 'ForbiddenError';
    this.resource = resource;
    this.action = action;
  }
}

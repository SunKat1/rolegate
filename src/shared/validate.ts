/**
 * Small checks for configs that may not come from TypeScript at all:
 * JSON files, database rows, an admin screen. TypeScript can't help there,
 * so we look at the shape ourselves when the checker is built. A broken
 * rule should stop the app on startup, not turn into a 500 (or worse, a
 * silent "no") in the middle of a request.
 */

export function configError(message: string): never {
  throw new Error(`rolegate: ${message}`);
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * "__proto__" is the one role name we refuse. In a plain object it doesn't
 * create a key, it swaps the prototype, so a role with that name either
 * vanishes or, worse, leaks its rules into every object in the app. Coming
 * from a database row, that's a privilege escalation waiting to happen.
 */
export function checkRoleName(name: unknown, where: string): asserts name is string {
  if (typeof name !== 'string' || name === '') configError(`role names must be non-empty strings (${where})`);
  if (name === '__proto__') configError(`"__proto__" can't be used as a role name (${where})`);
}

/** Checks `config.roles` itself and the `extends` list of every role. */
export function checkRolesObject(roles: unknown): asserts roles is Record<string, { extends?: unknown }> {
  if (!isObject(roles)) configError('config.roles should be an object like { admin: { ... } }');

  for (const [name, role] of Object.entries(roles)) {
    checkRoleName(name, 'in config.roles');
    if (!isObject(role)) configError(`role "${name}" should be an object`);
    const parents = role.extends;
    if (parents === undefined) continue;
    if (!Array.isArray(parents) || parents.some((p) => typeof p !== 'string')) {
      configError(`"extends" of role "${name}" should be a list of role names`);
    }
  }
}

/** Builds a dictionary without a prototype, so no key can ever mean something special. */
export const dictionary = <T>(): Record<string, T> => Object.create(null);

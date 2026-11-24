// Configs often come from JSON or a database, where TypeScript can't help.
// So we check the shape ourselves and fail on startup, not mid-request.

export function configError(message: string): never {
  throw new Error(`rolegate: ${message}`);
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An object without a prototype, so keys like "constructor" are just keys. */
export const dictionary = <T>(): Record<string, T> => Object.create(null);

/**
 * In a plain object "__proto__" swaps the prototype instead of adding a key,
 * so a role with that name could leak its rules into every object. We refuse it.
 */
export function checkRoleName(name: unknown, where: string): asserts name is string {
  if (typeof name !== 'string' || name === '') configError(`role names must be non-empty strings (${where})`);
  if (name === '__proto__') configError(`"__proto__" can't be used as a role name (${where})`);
}

/** Checks `config.roles` and the `extends` of each role. */
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

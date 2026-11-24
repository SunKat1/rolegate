/**
 * Role plumbing shared by both engines (resource checks and route checks).
 *
 * Both of them have the same idea of a role: it can extend other roles,
 * it has things it allows and things it denies, and a deny always wins.
 * The only difference is what a single "rule" looks like, so this file
 * is generic over the rule type and doesn't care what's inside.
 */

/** One role, or several, or nobody (not signed in). */
export type Roles = string | readonly string[] | undefined;

export interface RoleDefinition<R> {
  extends?: readonly string[];
  allow?: readonly R[];
  deny?: readonly R[];
}

/** A role after inheritance is applied: its own rules plus everything from its parents. */
export interface ResolvedRole<R> {
  allow: R[];
  deny: R[];
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Flattens `extends` for every role and returns them in a Map.
 *
 * We do it for the whole config right away, so a typo in a role name or a
 * circular `extends` blows up when the app starts and not in the middle of a request.
 */
export function resolveRoles<R>(definitions: Record<string, RoleDefinition<R>>): Map<string, ResolvedRole<R>> {
  const resolved = new Map<string, ResolvedRole<R>>();

  const resolve = (name: string, trail: string[]): ResolvedRole<R> => {
    const cached = resolved.get(name);
    if (cached) return cached;

    // hasOwn, not `in`: otherwise a role called "constructor" would quietly
    // pick up Object.prototype.constructor and look like a real role.
    if (!hasOwn(definitions, name)) {
      const from = trail.length ? trail.join(' -> ') : 'config';
      throw new Error(`rolegate: unknown role "${name}" (referenced by ${from})`);
    }
    if (trail.includes(name)) {
      throw new Error(`rolegate: circular "extends": ${[...trail, name].join(' -> ')}`);
    }

    const def = definitions[name];
    const role: ResolvedRole<R> = { allow: [], deny: [] };
    for (const parent of def.extends ?? []) {
      const p = resolve(parent, [...trail, name]);
      role.allow.push(...p.allow);
      role.deny.push(...p.deny);
    }
    role.allow.push(...(def.allow ?? []));
    role.deny.push(...(def.deny ?? []));

    resolved.set(name, role);
    return role;
  };

  for (const name of Object.keys(definitions)) resolve(name, []);
  return resolved;
}

/** Role names from whatever the app passed. Roles come from tokens, so junk like null or '' is skipped. */
export function roleNames(roles: Roles): string[] {
  const list: readonly unknown[] = typeof roles === 'string' ? [roles] : Array.isArray(roles) ? roles : [];
  return list.filter((name): name is string => typeof name === 'string' && name !== '');
}

/** The resolved roles we actually know about, out of the ones the app gave us. */
export function pickRoles<T>(known: Map<string, T>, roles: Roles): T[] {
  const picked: T[] = [];
  for (const name of roleNames(roles)) {
    const role = known.get(name);
    if (role) picked.push(role);
  }
  return picked;
}

/**
 * The one rule of the whole library: if any role denies, the answer is no.
 * Otherwise it's yes if at least one role allows. No roles at all means no.
 */
export function decide<T>(roles: T[], denies: (role: T) => boolean, allows: (role: T) => boolean): boolean {
  if (roles.length === 0) return false;
  if (roles.some(denies)) return false;
  return roles.some(allows);
}

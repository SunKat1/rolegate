// The optional `resources` list. With it, a rule for "psots" or an action
// "wirte" throws on startup instead of quietly never matching.

import { configError, isObject } from '../shared/validate.js';
import { ANY } from './rules.js';
import type { Entry } from './rules.js';
import type { Context, ResourceSchema } from './types.js';

export function checkSchema(resources: unknown): asserts resources is ResourceSchema | undefined {
  if (resources === undefined) return;
  if (!isObject(resources)) configError(`config.resources should be an object like { posts: ['read', 'write'] }`);

  for (const [name, actions] of Object.entries(resources)) {
    if (name === ANY) configError(`"*" can't be a resource name in config.resources`);
    if (!Array.isArray(actions) || actions.length === 0 || actions.some((a) => typeof a !== 'string' || a === '' || a === ANY)) {
      configError(`actions of resource "${name}" should be a non-empty list of names like ['read', 'write']`);
    }
  }
}

export function checkAgainstSchema<C extends Context>(entry: Entry<C>, schema: ResourceSchema): void {
  const where = `${entry.effect} of role "${entry.role}"`;

  if (entry.resource === ANY) {
    // '*' covers every resource, so the action just has to exist on at least one
    if (entry.action !== ANY && !Object.values(schema).some((actions) => actions.includes(entry.action))) {
      configError(`no resource has the action "${entry.action}" (${where})`);
    }
    return;
  }

  const actions = Object.prototype.hasOwnProperty.call(schema, entry.resource) ? schema[entry.resource] : undefined;
  if (!actions) configError(`unknown resource "${entry.resource}", it isn't in config.resources (${where})`);
  if (entry.action !== ANY && !actions.includes(entry.action)) {
    configError(`resource "${entry.resource}" has no action "${entry.action}" (${where})`);
  }
}

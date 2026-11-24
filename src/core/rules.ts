/**
 * Resource rules as the engine keeps them.
 *
 * In the config they're grouped by resource: `{ posts: ['read', 'write'] }`.
 * The shared role code (extends, deny wins) wants a flat list, so first we
 * flatten them into entries. After inheritance is applied we group them back
 * by resource, so a check only looks at the rules that can actually match.
 */

import { configError, isObject } from '../shared/validate.js';
import type { Context, ResourceRules, Rule } from './types.js';

/** '*' means "any resource" in the resource slot and "any action" in the action slot. */
export const ANY = '*';

/** One rule together with the resource it was written for. */
export interface Entry<C extends Context> {
  resource: string;
  rule: Rule<C>;
}

/** Rules grouped by resource name. */
export type RuleIndex<C extends Context> = Map<string, Rule<C>[]>;

/**
 * `{ posts: ['read'] }` -> `[{ resource: 'posts', rule: 'read' }]`, checking
 * the shape on the way. `where` goes into error messages, like 'allow of role "editor"'.
 */
export function toEntries<C extends Context>(rules: ResourceRules<C> | undefined, where: string): Entry<C>[] {
  if (rules === undefined) return [];
  if (!isObject(rules)) configError(`${where} should be an object like { posts: ['read'] }`);

  return Object.entries(rules).flatMap(([resource, list]) => {
    if (!Array.isArray(list)) configError(`rules for "${resource}" should be a list (${where})`);
    for (const rule of list) checkRule(rule, `${where}, resource "${resource}"`);
    return list.map((rule) => ({ resource, rule }));
  });
}

/** Groups the flat entries back by resource. */
export function toIndex<C extends Context>(entries: Entry<C>[]): RuleIndex<C> {
  const index: RuleIndex<C> = new Map();
  for (const { resource, rule } of entries) {
    const list = index.get(resource);
    if (list) list.push(rule);
    else index.set(resource, [rule]);
  }
  return index;
}

/** Is there a rule for this resource and action whose condition (if any) holds? */
export function matches<C extends Context>(index: RuleIndex<C>, resource: string, action: string, ctx: C): boolean {
  // Rules written for this exact resource, plus the "any resource" ones.
  const keys = resource === ANY ? [ANY] : [resource, ANY];

  for (const key of keys) {
    for (const rule of index.get(key) ?? []) {
      if (typeof rule === 'string') {
        if (rule === ANY || rule === action) return true;
        continue;
      }
      if (rule.action !== ANY && rule.action !== action) continue;
      if (!rule.when || rule.when(ctx)) return true;
    }
  }
  return false;
}

function checkRule(rule: unknown, where: string): void {
  if (typeof rule === 'string') return;
  if (!isObject(rule) || typeof rule.action !== 'string') {
    configError(`a rule should be an action name or { action, when? } (${where})`);
  }
  if (rule.when !== undefined && typeof rule.when !== 'function') {
    configError(`"when" for action "${rule.action}" should be a function (${where})`);
  }
}

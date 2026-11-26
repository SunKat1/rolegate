// Rules are grouped by resource in the config: { posts: ['read'] }.
// The shared role code wants a flat list, so we flatten them, apply
// inheritance, then group them back by resource for fast lookups.

import { configError, isObject } from '../shared/validate.js';
import { checkWhere, evaluateWhere } from './conditions/where.js';
import type { Context, ResourceRules, RuleInfo, When } from './types.js';

/** '*' means "any resource" in the resource slot and "any action" in the action slot. */
export const ANY = '*';

/** One rule, flattened, with a note of where it was written. */
export interface Entry<C extends Context> {
  role: string;
  effect: 'allow' | 'deny';
  resource: string;
  action: string;
  when?: When<C>;
}

/** Rules grouped by resource name. */
export type RuleIndex<C extends Context> = Map<string, Entry<C>[]>;

/** `{ posts: ['read'] }` -> `[{ resource: 'posts', action: 'read', ... }]`, checking the shape on the way. */
export function toEntries<C extends Context>(
  rules: ResourceRules<C> | undefined,
  role: string,
  effect: 'allow' | 'deny',
): Entry<C>[] {
  if (rules === undefined) return [];
  const where = `${effect} of role "${role}"`;
  if (!isObject(rules)) configError(`${where} should be an object like { posts: ['read'] }`);

  return Object.entries(rules).flatMap(([resource, list]) => {
    if (!Array.isArray(list)) configError(`rules for "${resource}" should be a list (${where})`);
    return list.map((rule): Entry<C> => {
      const place = `${where}, resource "${resource}"`;
      if (typeof rule === 'string') return { role, effect, resource, action: rule };

      if (!isObject(rule) || typeof rule.action !== 'string') {
        configError(`a rule should be an action name or { action, when? } (${place})`);
      }
      if (rule.when !== undefined && typeof rule.when !== 'function') checkWhere(rule.when, `${place}, action "${rule.action}"`);
      return { role, effect, resource, action: rule.action, when: rule.when as When<C> | undefined };
    });
  });
}

/** Groups the flat entries back by resource. */
export function toIndex<C extends Context>(entries: Entry<C>[]): RuleIndex<C> {
  const index: RuleIndex<C> = new Map();
  for (const entry of entries) {
    const list = index.get(entry.resource);
    if (list) list.push(entry);
    else index.set(entry.resource, [entry]);
  }
  return index;
}

/** Rules for this resource and action, ignoring conditions. The '*' ones are included. */
export function* candidates<C extends Context>(index: RuleIndex<C>, resource: string, action: string): Generator<Entry<C>> {
  const keys = resource === ANY ? [ANY] : [resource, ANY];
  for (const key of keys) {
    for (const entry of index.get(key) ?? []) {
      if (entry.action === ANY || entry.action === action) yield entry;
    }
  }
}

/** The first rule for this resource and action whose condition (if any) holds. */
export function findMatch<C extends Context>(index: RuleIndex<C>, resource: string, action: string, ctx: C): Entry<C> | undefined {
  // the same walk as candidates(), without a generator: this runs on every check
  const keys = resource === ANY ? [ANY] : [resource, ANY];
  for (const key of keys) {
    for (const entry of index.get(key) ?? []) {
      if ((entry.action === ANY || entry.action === action) && holds(entry.when, ctx)) return entry;
    }
  }
  return undefined;
}

function holds<C extends Context>(when: When<C> | undefined, ctx: C): boolean {
  if (when === undefined) return true;
  return typeof when === 'function' ? when(ctx) : evaluateWhere(when, ctx);
}

/** What explain() shows about a rule. The condition itself stays out, it may be a function. */
export function describeEntry<C extends Context>(entry: Entry<C>): RuleInfo {
  const condition = entry.when === undefined ? 'none' : typeof entry.when === 'function' ? 'function' : 'object';
  return { effect: entry.effect, role: entry.role, resource: entry.resource, action: entry.action, condition };
}

export function ruleText(info: RuleInfo): string {
  const cond = info.condition === 'none' ? '' : ' (with a condition)';
  return `role "${info.role}" ${info.effect === 'allow' ? 'allows' : 'denies'} ${info.action} on ${info.resource}${cond}`;
}

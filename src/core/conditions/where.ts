// Conditions written as plain objects instead of functions:
//
//   { authorId: { ref: 'userId' } }   the post's authorId equals the user's id
//   { status: 'published' }           a fixed value
//   { status: ['draft', 'review'] }   one of these
//
// Unlike a function, an object like this can be stored in a database, sent to
// the browser, and turned into a query filter (see ../filter.ts).

import { configError, isObject } from '../../shared/validate.js';

export type Scalar = string | number | boolean | null;

/** "Take the value from this context key", e.g. `{ ref: 'userId' }`. */
export interface Ref {
  ref: string;
}

export type FieldCondition = Scalar | readonly Scalar[] | Ref;

/** Field name -> what it has to be. All fields have to match. */
export type Where = { readonly [field: string]: FieldCondition };

// Field names end up as column names in SQL, so we keep them boring on purpose.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

export const isRef = (value: unknown): value is Ref => isObject(value) && typeof value.ref === 'string';

const isScalar = (value: unknown): value is Scalar =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** Reads a context key, but only an own one: `__proto__` or `constructor` aren't data. */
export function readField(ctx: object, key: string): unknown {
  return hasOwn(ctx, key) ? (ctx as Record<string, unknown>)[key] : undefined;
}

/** A ref has to point at a real value. A missing user id must never equal a missing author id. */
export function readRef(ctx: object, ref: Ref): unknown {
  const value = readField(ctx, ref.ref);
  return value === null ? undefined : value;
}

/** Does `ctx` satisfy the object condition? Missing data means no. */
export function evaluateWhere(where: Where, ctx: object): boolean {
  for (const [field, expected] of Object.entries(where)) {
    const actual = readField(ctx, field);
    if (actual === undefined) return false;

    if (isRef(expected)) {
      const target = readRef(ctx, expected);
      if (target === undefined || actual !== target) return false;
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual as Scalar)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/** Checks the shape up front, same as the rest of the config. */
export function checkWhere(where: unknown, place: string): asserts where is Where {
  if (!isObject(where)) configError(`"when" should be a function or an object like { authorId: { ref: 'userId' } } (${place})`);

  const fields = Object.keys(where);
  // {} would allow everything, which is almost certainly not what was meant
  if (fields.length === 0) configError(`"when" is an empty object (${place})`);

  for (const field of fields) {
    if (!IDENTIFIER.test(field)) configError(`"${field}" isn't a valid field name, use letters, digits and _ (${place})`);
    const value = where[field];

    if (isRef(value)) {
      if (!IDENTIFIER.test(value.ref)) configError(`ref "${value.ref}" isn't a valid context key (${place})`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) configError(`the list for "${field}" is empty, nothing could ever match (${place})`);
      if (!value.every(isScalar)) configError(`the list for "${field}" should only hold strings, numbers, booleans or null (${place})`);
    } else if (!isScalar(value)) {
      configError(`"${field}" should be a value, a list of values or { ref: 'contextKey' } (${place})`);
    }
  }
}

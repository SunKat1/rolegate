import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPrisma } from '../../src/index.js';

test('everything and nothing', () => {
  assert.deepEqual(toPrisma(true), {});
  assert.deepEqual(toPrisma(false), { OR: [] });
});

test('fields, lists and nulls', () => {
  assert.deepEqual(toPrisma({ field: 'authorId', eq: 7 }), { authorId: 7 });
  assert.deepEqual(toPrisma({ field: 'deletedAt', eq: null }), { deletedAt: null });
  assert.deepEqual(toPrisma({ field: 'status', in: ['a', 'b'] }), { status: { in: ['a', 'b'] } });
});

test('and, or, not', () => {
  assert.deepEqual(
    toPrisma({ and: [{ or: [{ field: 'a', eq: 1 }, { field: 'b', eq: 2 }] }, { not: { field: 'c', eq: true } }] }),
    { AND: [{ OR: [{ a: 1 }, { b: 2 }] }, { NOT: { c: true } }] },
  );
});

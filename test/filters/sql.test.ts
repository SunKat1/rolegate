import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSql } from '../../src/index.js';

test('everything and nothing', () => {
  assert.deepEqual(toSql(true), { sql: '1=1', params: [] });
  assert.deepEqual(toSql(false), { sql: '1=0', params: [] });
});

test('values go into params, never into the string', () => {
  assert.deepEqual(toSql({ field: 'title', eq: "x' OR 1=1 --" }), { sql: '"title" = ?', params: ["x' OR 1=1 --"] });
});

test('nested filters, with Postgres placeholders', () => {
  const filter = { and: [{ or: [{ field: 'status', eq: 'published' }, { field: 'authorId', eq: 7 }] }, { not: { field: 'archived', eq: true } }] };
  assert.deepEqual(toSql(filter, { placeholder: (i) => `$${i}` }), {
    sql: '(("status" = $1 OR "authorId" = $2) AND NOT "archived" = $3)',
    params: ['published', 7, true],
  });
});

test('numbering can continue after your own params', () => {
  assert.equal(toSql({ field: 'a', eq: 1 }, { placeholder: (i) => `$${i}`, firstIndex: 3 }).sql, '"a" = $3');
});

test('NULL gets IS NULL, inside lists too', () => {
  assert.equal(toSql({ field: 'deletedAt', eq: null }).sql, '"deletedAt" IS NULL');
  assert.deepEqual(toSql({ field: 's', in: ['a', null] }), { sql: '("s" IN (?) OR "s" IS NULL)', params: ['a'] });
  assert.deepEqual(toSql({ field: 's', in: [null] }), { sql: '"s" IS NULL', params: [] });
});

test('custom quoting, e.g. MySQL', () => {
  assert.equal(toSql({ field: 'a', in: [1, 2] }, { quote: (c) => `\`${c}\`` }).sql, '`a` IN (?, ?)');
});

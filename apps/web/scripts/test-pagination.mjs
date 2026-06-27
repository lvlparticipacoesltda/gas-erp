/**
 * Smoke test dos helpers de paginação (rodar: node scripts/test-pagination.mjs)
 */
import assert from 'node:assert/strict';

function pageRange(page, pageSize, total) {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

function paginateSlice(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPagesFor(count, pageSize) {
  return Math.ceil(count / pageSize) || 1;
}

assert.deepEqual(pageRange(1, 20, 150), { from: 1, to: 20 });
assert.deepEqual(pageRange(2, 20, 150), { from: 21, to: 40 });
assert.deepEqual(pageRange(8, 20, 150), { from: 141, to: 150 });
assert.deepEqual(pageRange(1, 20, 0), { from: 0, to: 0 });

assert.equal(totalPagesFor(150, 20), 8);
assert.equal(totalPagesFor(0, 20), 1);

const items = Array.from({ length: 25 }, (_, i) => i + 1);
assert.deepEqual(paginateSlice(items, 1, 20), items.slice(0, 20));
assert.deepEqual(paginateSlice(items, 2, 20), items.slice(20, 25));

console.log('pagination helpers: OK');

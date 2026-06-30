import {
  getBusinessDayBounds,
  getBusinessDayRangeBounds,
  resolveDashboardDateRange,
  saleInstantFromDateKey,
  saleDateInRange,
} from '../dist/index.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

const monthEndCases = [
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2024-02-29',
];

for (const key of monthEndCases) {
  const { start, end } = getBusinessDayBounds(key);
  assert(`${key} bounds ordered`, end > start);
  const saleDate = saleInstantFromDateKey(key);
  assert(`${key} saleDate in bounds`, saleDateInRange(saleDate, start, end));
}

const range = resolveDashboardDateRange({ dateFrom: '2026-06-27', dateTo: '2026-06-30' });
assert('27-30 range ordered', range.end > range.start);
const day27 = getBusinessDayBounds('2026-06-27');
const day27Sale = saleInstantFromDateKey('2026-06-27');
assert('27 sale in 27-30 range', saleDateInRange(day27Sale, range.start, range.end));
assert('27 start in 27-30 range', saleDateInRange(day27.start, range.start, range.end));

const single30 = resolveDashboardDateRange({ date: '2026-06-30' });
assert('single 30 ordered', single30.end > single30.start);
assert(
  '30 sale in single 30',
  saleDateInRange(saleInstantFromDateKey('2026-06-30'), single30.start, single30.end),
);

console.log('range 27-30:', range.start.toISOString(), '->', range.end.toISOString());
console.log('single 30:', single30.start.toISOString(), '->', single30.end.toISOString());

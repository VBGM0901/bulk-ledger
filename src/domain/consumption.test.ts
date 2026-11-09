import { depletionDate, estimateStock, measuredDailyUse } from './consumption';

test('peanut butter 200g over 10/27~11/9 → 14.3 g/day', () => {
  const use = measuredDailyUse([{ id: 'f1', foodId: 'pb', startDate: '2026-10-27', endDate: '2026-11-09', qty: 200 }], 'pb')!;
  expect(Math.round(use * 10) / 10).toBe(14.3);
});
test('multiple finishes pool qty and days', () => {
  const use = measuredDailyUse([
    { id: 'a', foodId: 'pb', startDate: '2026-11-01', endDate: '2026-11-10', qty: 200 },
    { id: 'b', foodId: 'pb', startDate: '2026-11-11', endDate: '2026-11-20', qty: 300 },
    { id: 'c', foodId: 'egg', startDate: '2026-11-01', endDate: '2026-11-02', qty: 4 },
  ], 'pb');
  expect(use).toBe(25);
  expect(measuredDailyUse([], 'pb')).toBeNull();
});
test('estimateStock subtracts daily use between events and never below 0', () => {
  const ev = [
    { id: '1', foodId: 'yogurt', date: '2026-11-10', type: 'purchase' as const, qty: 24 },
    { id: '2', foodId: 'yogurt', date: '2026-11-20', type: 'purchase' as const, qty: 12 },
  ];
  expect(estimateStock(ev, 'yogurt', 1, '2026-11-10')).toBe(24);
  expect(estimateStock(ev, 'yogurt', 1, '2026-11-15')).toBe(19);
  expect(estimateStock(ev, 'yogurt', 1, '2026-11-20')).toBe(26);
  expect(estimateStock(ev, 'yogurt', 5, '2026-12-31')).toBe(0);
});
test('adjust sets absolute stock', () => {
  const ev = [
    { id: '1', foodId: 'egg', date: '2026-11-10', type: 'purchase' as const, qty: 30 },
    { id: '2', foodId: 'egg', date: '2026-11-11', type: 'adjust' as const, qty: 10 },
  ];
  expect(estimateStock(ev, 'egg', 4, '2026-11-12')).toBe(6);
});
test('depletionDate', () => {
  expect(depletionDate(10, 4, '2026-11-10')).toBe('2026-11-12');
  expect(depletionDate(10, 0, '2026-11-10')).toBeNull();
});

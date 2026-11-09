import { goalWeightOn, movingAverage, weeklyRate } from './weight';

const logs = [
  { date: '2026-11-03', kg: 69.6 }, { date: '2026-11-05', kg: 70.0 }, { date: '2026-11-09', kg: 70.0 },
  { date: '2026-11-12', kg: 70.4 }, { date: '2026-11-16', kg: 70.6 },
];

test('7-day moving average uses logs in [date-6, date]', () => {
  expect(movingAverage(logs, '2026-11-09')).toBeCloseTo((69.6 + 70.0 + 70.0) / 3, 5);
  expect(movingAverage(logs, '2026-11-16')).toBeCloseTo(70.5, 5);
  expect(movingAverage([], '2026-11-16')).toBeNull();
});
test('goal line interpolates and clamps', () => {
  const g = { startKg: 70, targetKg: 76, startDate: '2026-11-09', endDate: '2027-02-09' };
  expect(goalWeightOn(g, '2026-11-09')).toBe(70);
  expect(goalWeightOn(g, '2027-02-09')).toBe(76);
  expect(goalWeightOn(g, '2027-03-01')).toBe(76);
  expect(goalWeightOn(g, '2026-12-25')).toBeCloseTo(70 + (6 * 46) / 92, 5);
});
test('weekly rate compares averages one week apart', () => {
  // 11/16 avg = (70.4+70.6)/2 = 70.5 ; 11/09 avg = (69.6+70.0+70.0)/3
  expect(weeklyRate(logs, '2026-11-16')).toBeCloseTo(70.5 - (69.6 + 70.0 + 70.0) / 3, 5);
  expect(weeklyRate(logs.slice(-1), '2026-11-16')).toBeNull();
});

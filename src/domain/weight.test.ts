import { addDays } from './dates';
import { forecastDate, goalWeightOn, movingAverage, weeklyRate } from './weight';

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

import { bulkAdvice } from './weight';
const goal = { startKg: 70, targetKg: 76, startDate: '2026-11-01', endDate: '2027-02-01' }; // 주 ~0.46kg
const flat = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, kg: 70 }));
const rising = (perWeek: number) => flat.map((l, i) => ({ ...l, kg: 70 + (perWeek / 7) * i }));

test('bulk advice: data, eat plan first, add, on track, too fast', () => {
  expect(bulkAdvice([], goal, '2026-11-14', null).kind).toBe('need-data');
  expect(bulkAdvice(flat, goal, '2026-11-14', 0.7).kind).toBe('eat-plan');
  // 1주만 느림(2주 전 기록 없음) → 기다림
  expect(bulkAdvice(flat, goal, '2026-11-14', 0.98).kind).toBe('wait');
  // 3주 내내 그대로 → 2주 연속 느림 → +250
  const flat3 = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-25', i), kg: 70 }));
  const add = bulkAdvice(flat3, goal, '2026-11-14', 0.98);
  expect(add.kind).toBe('add');
  expect(add.kcalDelta).toBe(250);
  expect(bulkAdvice(rising(0.45), goal, '2026-11-14', 1).kind).toBe('on-track');
  expect(bulkAdvice(rising(1.2), goal, '2026-11-14', 1).kind).toBe('too-fast');
  expect(bulkAdvice(flat, goal, '2026-11-14', null).targetRate).toBeCloseTo(6 / (92 / 7), 3);
});

test('forecast: date when the goal is reached at the current pace, null when not gaining', () => {
  const g = { startKg: 70, targetKg: 72, startDate: '2026-10-25', endDate: '2027-01-25' };
  const up = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-25', i), kg: 70 + (0.5 / 7) * i }));
  const f = forecastDate(up, g, '2026-11-14')!;
  expect(f > '2026-11-14' && f < '2026-12-01').toBe(true);
  const flat3 = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-25', i), kg: 70 }));
  expect(forecastDate(flat3, g, '2026-11-14')).toBeNull();
});

test('forecast says "reached" (today) once at the goal even if weight levelled off', () => {
  const g = { startKg: 70, targetKg: 70, startDate: '2026-10-25', endDate: '2027-01-25' };
  const flat3 = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-25', i), kg: 70 }));
  expect(forecastDate(flat3, g, '2026-11-14')).toBe('2026-11-14');
});

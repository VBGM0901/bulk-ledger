import { weeklyReview, weekStart } from './checkin';
import { addDays } from './dates';
import { DEFAULT_FOODS, DEFAULT_SETTINGS } from './defaults';
import type { BulkAdvice } from './weight';

const add: BulkAdvice = { kind: 'add', kcalDelta: 250, title: '', detail: '', targetRate: 0.46, rate: 0 };
const all = Object.fromEntries(DEFAULT_SETTINGS.meals.map((m) => [m.name, 'all' as const]));
const intakes = (today: string) => Array.from({ length: 7 }, (_, i) => ({ date: addDays(today, -(i + 1)), meals: all }));

test('week starts on Monday', () => {
  expect(weekStart('2026-11-10')).toBe('2026-11-09'); // 화 → 월
  expect(weekStart('2026-11-15')).toBe('2026-11-09'); // 일 → 그 주 월
  expect(weekStart('2026-11-16')).toBe('2026-11-16');
});

test('a check-in on Sunday blocks another +250 on Monday (less than 7 days)', () => {
  const s = { ...DEFAULT_SETTINGS, checkins: [{ week: '2026-11-09', choice: 'apply' as const, delta: 250, kcalAfter: 3050, at: '2026-11-15T03:00:00.000Z' }] };
  const mon = weeklyReview('2026-11-16', s, DEFAULT_FOODS, [], intakes('2026-11-16'), [], add)!;
  expect(mon.done).toBe(true);
  const nextMon = weeklyReview('2026-11-23', s, DEFAULT_FOODS, [], intakes('2026-11-23'), [], add)!;
  expect(nextMon.done).toBe(false);
});

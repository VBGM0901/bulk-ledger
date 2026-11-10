import { addDays } from './dates';
import { DEFAULT_FOODS, DEFAULT_SETTINGS } from './defaults';
import { eatingStreak, goalProgress, recentMilestone } from './motivation';

const all = Object.fromEntries(DEFAULT_SETTINGS.meals.map((m) => [m.name, 'all' as const]));
const day = (date: string) => ({ date, meals: all });

test('streak counts good days back from yesterday when today is not done yet; best keeps the longest run', () => {
  const intakes = [day('2026-11-01'), day('2026-11-02'), day('2026-11-03'), day('2026-11-04'), /* 5 빠짐 */ day('2026-11-08'), day('2026-11-09')];
  const r = eatingStreak('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], intakes);
  expect(r.current).toBe(2); // 11-08, 11-09 (오늘 아직)
  expect(r.best).toBe(4);
  expect(eatingStreak('2026-11-09', DEFAULT_FOODS, DEFAULT_SETTINGS, [], intakes).current).toBe(2); // 오늘 다 먹으면 오늘 포함
});

test('goal progress from 7-day average', () => {
  const g = { startKg: 54, targetKg: 60, startDate: '2026-11-09', endDate: '2027-02-09' };
  const p = goalProgress([{ date: '2026-11-10', kg: 55.5 }], g, '2026-11-10')!;
  expect(p.pct).toBeCloseTo(25, 5);
  expect(p.left).toBeCloseTo(4.5, 5);
  expect(goalProgress([], g, '2026-11-10')).toBeNull();
});

test('milestone shows for 3 days after the 7-day average first passes +1kg', () => {
  const g = { startKg: 54, targetKg: 60, startDate: '2026-11-01', endDate: '2027-02-01' };
  const logs = Array.from({ length: 20 }, (_, i) => ({ date: addDays('2026-11-01', i), kg: 54 + i * 0.1 }));
  // 7일 평균이 55kg을 처음 넘는 날 = 11-14 (54 + (13-3)×0.1)
  const m = recentMilestone(logs, g, '2026-11-15')!;
  expect(m).toMatchObject({ gained: 1, kg: 55, on: '2026-11-14' });
  expect(recentMilestone(logs, g, addDays(m.on, 4))).toBeNull();
});

import { DEFAULT_FOODS, DEFAULT_SETTINGS } from './defaults';
import { dayIntake, gradeOf, recentIntakePct } from './intake';

const names = DEFAULT_SETTINGS.meals.map((m) => m.name);
const all = Object.fromEntries(names.map((n) => [n, 'all' as const]));

test('no log → null; all eaten → plan kcal', () => {
  expect(dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [])).toBeNull();
  const d = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: all }])!;
  expect(d.kcal).toBe(2626);
  expect(d.checked).toBe(names.length);
  expect(d.grade).toBe('ok'); // 2626/2800 = 94%
});

test('half and none reduce intake; unchecked meals count as 0', () => {
  const half = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: { ...all, 아침: 'half', 점심: 'none' } }])!;
  const full = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: all }])!;
  expect(half.kcal).toBeLessThan(full.kcal);
  const one = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: { 아침: 'all' } }])!;
  expect(one.checked).toBe(1);
  expect(one.grade).toBe('low');
});

test('dinner choice of that day is used', () => {
  const meat = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: { 저녁: 'all' } }])!;
  const less = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [{ date: '2026-11-10', choice: 'less' }], [{ date: '2026-11-10', meals: { 저녁: 'all' } }])!;
  expect(meat.kcal - less.kcal).toBe(250);
});

test('grades and recent average', () => {
  expect(gradeOf(0.96)).toBe('good');
  expect(gradeOf(0.8)).toBe('ok');
  expect(gradeOf(0.5)).toBe('low');
  const r = recentIntakePct('2026-11-10', 7, DEFAULT_FOODS, DEFAULT_SETTINGS, [], [
    { date: '2026-11-10', meals: all }, { date: '2026-11-08', meals: {} }, { date: '2026-11-01', meals: all },
  ])!;
  expect(r.logged).toBe(2);
  expect(recentIntakePct('2026-11-10', 7, DEFAULT_FOODS, DEFAULT_SETTINGS, [], [])).toBeNull();
});

import { HOME_KEY, initialItems } from './intake';

test('per-food quantities override meal status; dinner home portion uses the dinner preset', () => {
  const breakfast = DEFAULT_SETTINGS.meals.find((m) => m.name === '아침')!;
  const items = { ...initialItems(breakfast, 'all'), egg: 1 }; // 계란 2개 → 1개
  const d = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: {}, items: { 아침: items } }])!;
  expect(d.kcal).toBe(399 - 72);
  expect(d.checked).toBe(1);
  const dinner = DEFAULT_SETTINGS.meals.find((m) => m.name === '저녁')!;
  expect(initialItems(dinner, 'half')[HOME_KEY]).toBe(0.5);
  const dn = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [{ date: '2026-11-10', meals: {}, items: { 저녁: { nuts: 0, [HOME_KEY]: 1 } } }])!;
  expect(dn.kcal).toBe(650);
});

test('extra foods add to the day', () => {
  const d = dayIntake('2026-11-10', DEFAULT_FOODS, DEFAULT_SETTINGS, [], [
    { date: '2026-11-10', meals: {}, extras: [{ id: 'x', name: '삼각김밥', kcal: 200, protein: 5 }] },
  ])!;
  expect(d.kcal).toBe(200);
  expect(d.protein).toBe(5);
  expect(d.checked).toBe(0);
});

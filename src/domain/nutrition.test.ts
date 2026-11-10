import { DEFAULT_FOODS, DEFAULT_MEALS, DEFAULT_SETTINGS } from './defaults';
import { costEfficiency, dailyNutrition } from './nutrition';

test('2,800 template with meat dinner', () => {
  const n = dailyNutrition(DEFAULT_FOODS, DEFAULT_MEALS, DEFAULT_SETTINGS.dinner.meat);
  expect(n.kcal).toBe(2626);
  expect(n.protein).toBe(125.2);
  expect(n.byMeal.map((m) => m.kcal)).toEqual([399, 491, 632, 298, 806]);
});

test('dinner without meat lowers protein by 18g', () => {
  expect(dailyNutrition(DEFAULT_FOODS, DEFAULT_MEALS, DEFAULT_SETTINGS.dinner.none).protein).toBe(107.2);
});

test('unknown foodId in template is ignored, not NaN', () => {
  const n = dailyNutrition(DEFAULT_FOODS, [{ name: 'x', items: [{ foodId: 'ghost', qty: 3 }] }], { kcal: 0, protein: 0 });
  expect(n).toEqual({ kcal: 0, protein: 0, byMeal: [{ name: 'x', kcal: 0, protein: 0 }] });
});

test('cost efficiency', () => {
  const egg = DEFAULT_FOODS.find((f) => f.id === 'egg')!;
  const e = costEfficiency(egg);
  expect(e.perKcal).toBeCloseTo(9980 / 30 / 72, 3);
  expect(e.perProteinG).toBeCloseTo(9980 / 30 / 6.5, 3);
  expect(costEfficiency(DEFAULT_FOODS.find((f) => f.id === 'juice')!)).toEqual({ perKcal: 0, perProteinG: 0 });
});

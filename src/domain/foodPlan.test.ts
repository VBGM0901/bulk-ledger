import { DEFAULT_FOODS, DEFAULT_MEALS } from './defaults';
import { dailyQtyByFood, planFoodPurchases } from './foodPlan';

const line = (plan: ReturnType<typeof planFoodPurchases>, id: string) => plan.lines.find((l) => l.foodId === id)!;

test('daily quantities from template', () => {
  expect(dailyQtyByFood(DEFAULT_MEALS)).toEqual({ juice: 1, yogurt: 1, egg: 4, bread: 3, pb: 48, banana: 2, rice: 1, nuts: 30, milk: 200 });
});

test('30-day plan costs 299,820 with no stock (milk 6L = 16,200)', () => {
  const plan = planFoodPurchases(DEFAULT_FOODS, DEFAULT_MEALS, 30);
  const cost = Object.fromEntries(plan.lines.map((l) => [l.foodId, l.result?.cost]));
  expect(cost).toEqual({ rice: 96900, egg: 39920, banana: 35880, yogurt: 54840, bread: 22600, pb: 22500, nuts: 10980, milk: 16200 });
  expect(plan.total).toBe(299820);
  expect(plan.lines.find((l) => l.foodId === 'juice')).toBeUndefined();
});

test('starting stock reduces purchases', () => {
  const plan = planFoodPurchases(DEFAULT_FOODS, DEFAULT_MEALS, 30, { yogurt: 6 });
  expect(line(plan, 'yogurt').result!.cost).toBe(35760);
});

test('31-day month recomputes (rice 31 → 18+18)', () => {
  const plan = planFoodPurchases(DEFAULT_FOODS, DEFAULT_MEALS, 31);
  expect(line(plan, 'rice').result!.cost).toBe(119200);
});

test('food without pack options is reported missing, not NaN', () => {
  const foods = DEFAULT_FOODS.map((f) => (f.id === 'nuts' ? { ...f, packOptions: [] } : f));
  const plan = planFoodPurchases(foods, DEFAULT_MEALS, 30);
  expect(plan.missing).toEqual(['nuts']);
  expect(plan.total).toBe(299820 - 10980);
});


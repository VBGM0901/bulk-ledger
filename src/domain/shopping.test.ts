import { DEFAULT_FOODS } from './defaults';
import { planShopping } from './shopping';

const dailyUse = { yogurt: 1, egg: 4, banana: 2, bread: 3, pb: 48, rice: 1, nuts: 30 };

test('only items running out within horizon are listed, grouped by shipping', () => {
  const groups = planShopping({
    foods: DEFAULT_FOODS, dailyUse, horizonDays: 3, coverDays: 7,
    stock: { yogurt: 20, egg: 30, banana: 0, bread: 30, pb: 500, rice: 10, nuts: 500 },
  });
  expect(groups.map((g) => g.group)).toEqual(['rocketFresh']);
  const fresh = groups[0];
  expect(fresh.lines.map((l) => l.foodId)).toEqual(['banana']);
  expect(fresh.lines[0].cost).toBe(2990 * 3);
  expect(fresh.belowMinimum).toBe(true);
  expect(fresh.minimum).toBe(15000);
});

test('rocket fresh at or above 15,000 is fine; free foods never listed', () => {
  const groups = planShopping({ foods: DEFAULT_FOODS, dailyUse: { ...dailyUse, juice: 2 }, stock: {}, horizonDays: 3, coverDays: 7 });
  const fresh = groups.find((g) => g.group === 'rocketFresh')!;
  expect(fresh.total).toBe(9980 + 8970 + 19080 + 7590);
  expect(fresh.belowMinimum).toBe(false);
  expect(groups.flatMap((g) => g.lines).some((l) => l.foodId === 'juice')).toBe(false);
  expect(groups.map((g) => g.group)).toEqual(['rocketFresh', 'rocket', 'sellerRocket', 'sellerFree']);
});

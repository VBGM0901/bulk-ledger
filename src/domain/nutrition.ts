import { minUnitPrice } from './optimizer';
import type { FoodItem, Meal } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface NutritionSummary {
  kcal: number;
  protein: number;
  byMeal: { name: string; kcal: number; protein: number }[];
}

/** 하루 계획 영양. 저녁 집밥은 '저녁' 끼니에 더한다. */
export function dailyNutrition(foods: FoodItem[], meals: Meal[], dinner: { kcal: number; protein: number }): NutritionSummary {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const byMeal = meals.map((m) => {
    let kcal = 0;
    let protein = 0;
    for (const it of m.items) {
      const f = byId.get(it.foodId);
      if (!f) continue;
      kcal += f.perUnit.kcal * it.qty;
      protein += f.perUnit.protein * it.qty;
    }
    if (m.name === '저녁') {
      kcal += dinner.kcal;
      protein += dinner.protein;
    }
    return { name: m.name, kcal: Math.round(kcal), protein: r1(protein) };
  });
  return {
    kcal: byMeal.reduce((s, m) => s + m.kcal, 0),
    protein: r1(byMeal.reduce((s, m) => s + m.protein, 0)),
    byMeal,
  };
}

export function costEfficiency(food: FoodItem): { perKcal: number | null; perProteinG: number | null } {
  if (food.free) return { perKcal: 0, perProteinG: 0 };
  const unit = minUnitPrice(food);
  if (unit === null) return { perKcal: null, perProteinG: null };
  return {
    perKcal: food.perUnit.kcal > 0 ? unit / food.perUnit.kcal : null,
    perProteinG: food.perUnit.protein > 0 ? unit / food.perUnit.protein : null,
  };
}

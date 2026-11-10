import { cheapestPacks, type PackResult } from './optimizer';
import type { FoodItem, Meal } from './types';

export function dailyQtyByFood(meals: Meal[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of meals) for (const it of m.items) out[it.foodId] = (out[it.foodId] ?? 0) + it.qty;
  return out;
}

export interface FoodPlanLine {
  foodId: string;
  needed: number;
  stock: number;
  result: PackResult | null;
  /** 먹은 만큼의 원가 (최저 단가 기준) — 실제 결제액과 다르다. */
}
export interface FoodPlan { lines: FoodPlanLine[]; total: number; missing: string[] }

export function planFoodPurchases(
  foods: FoodItem[],
  meals: Meal[],
  days: number,
  stock: Record<string, number> = {},
): FoodPlan {
  const daily = dailyQtyByFood(meals);
  const lines: FoodPlanLine[] = [];
  const missing: string[] = [];
  let total = 0;
  for (const food of foods) {
    const perDay = daily[food.id] ?? 0;
    if (food.free || perDay <= 0) continue;
    const needed = perDay * days;
    const have = stock[food.id] ?? 0;
    const result = cheapestPacks(needed - have, food.packOptions);
    if (result === null) missing.push(food.id);
    else total += result.cost;
    lines.push({
      foodId: food.id,
      needed,
      stock: have,
      result,
    });
  }
  return { lines, total, missing };
}

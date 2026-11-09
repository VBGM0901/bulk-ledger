import { cheapestPacks, type PackChoice } from './optimizer';
import type { FoodItem, ShippingGroup } from './types';

export const ROCKET_FRESH_MIN = 15000;
export interface ShoppingLine { foodId: string; daysLeft: number; neededQty: number; choices: PackChoice[]; cost: number }
export interface ShoppingGroup { group: ShippingGroup; lines: ShoppingLine[]; total: number; minimum: number; belowMinimum: boolean }

const ORDER: ShippingGroup[] = ['rocketFresh', 'rocket', 'sellerRocket', 'sellerFree', 'none'];

/** horizonDays 안에 떨어지는 식품을 coverDays치 채우는 최저가 주문을 배송 그룹별로 묶는다. */
export function planShopping(input: {
  foods: FoodItem[];
  dailyUse: Record<string, number>;
  stock: Record<string, number>;
  horizonDays?: number;
  coverDays?: number;
}): ShoppingGroup[] {
  const { foods, dailyUse, stock, horizonDays = 3, coverDays = 7 } = input;
  const map = new Map<ShippingGroup, ShoppingLine[]>();
  for (const f of foods) {
    const use = dailyUse[f.id] ?? 0;
    if (f.free || use <= 0) continue;
    const have = stock[f.id] ?? 0;
    const daysLeft = Math.floor(have / use);
    if (daysLeft > horizonDays) continue;
    const neededQty = Math.ceil(use * coverDays - have);
    const r = cheapestPacks(neededQty, f.packOptions);
    if (!r || r.cost === 0) continue;
    const list = map.get(f.shippingGroup) ?? [];
    list.push({ foodId: f.id, daysLeft, neededQty, choices: r.choices, cost: r.cost });
    map.set(f.shippingGroup, list);
  }
  return ORDER.filter((g) => map.has(g)).map((group) => {
    const lines = map.get(group)!;
    const total = lines.reduce((s, l) => s + l.cost, 0);
    const minimum = group === 'rocketFresh' ? ROCKET_FRESH_MIN : 0;
    return { group, lines, total, minimum, belowMinimum: total < minimum };
  });
}

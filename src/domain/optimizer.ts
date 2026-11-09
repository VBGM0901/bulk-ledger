import type { FoodItem, PackOption } from './types';

export interface PackChoice { option: PackOption; count: number }
export interface PackResult { choices: PackChoice[]; cost: number; qty: number }

/**
 * Cheapest combination of packs giving at least `needed` units (unbounded knapsack).
 * needed ≤ 0 → buy nothing. No usable options → null.
 */
export function cheapestPacks(needed: number, options: PackOption[]): PackResult | null {
  if (needed <= 0) return { choices: [], cost: 0, qty: 0 };
  const opts = options.filter((o) => Number.isInteger(o.qty) && o.qty > 0 && Number.isFinite(o.price) && o.price >= 0);
  if (opts.length === 0) return null;
  const need = Math.ceil(needed);
  const limit = need + Math.max(...opts.map((o) => o.qty));
  const cost = new Array<number>(limit + 1).fill(Infinity);
  const from = new Array<number>(limit + 1).fill(-1);
  cost[0] = 0;
  for (let i = 1; i <= limit; i++) {
    opts.forEach((o, idx) => {
      if (o.qty <= i && cost[i - o.qty] + o.price < cost[i]) {
        cost[i] = cost[i - o.qty] + o.price;
        from[i] = idx;
      }
    });
  }
  let best = -1;
  for (let i = need; i <= limit; i++) if (cost[i] < Infinity && (best < 0 || cost[i] < cost[best])) best = i;
  if (best < 0) return null;
  const counts = new Map<number, number>();
  for (let i = best; i > 0; i -= opts[from[i]].qty) counts.set(from[i], (counts.get(from[i]) ?? 0) + 1);
  const choices = [...counts.entries()]
    .sort((a, b) => opts[b[0]].qty - opts[a[0]].qty)
    .map(([idx, count]) => ({ option: opts[idx], count }));
  return { choices, cost: cost[best], qty: best };
}

export function minUnitPrice(food: FoodItem): number | null {
  const ps = food.packOptions.filter((o) => o.qty > 0).map((o) => o.price / o.qty);
  return ps.length ? Math.min(...ps) : null;
}

export function describeChoices(choices: PackChoice[]): string {
  return choices.map((c) => `${c.option.label}×${c.count}`).join(' + ');
}

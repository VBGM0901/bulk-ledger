import type { Expense, ExpenseCategory, IntakeExtra, IntakeLog } from './types';

export interface FavExpense { memo: string; category: ExpenseCategory; amount: number; count: number; last: string }
export interface FavExtra { name: string; kcal: number; protein: number; count: number; last: string }

/** 많이 쓴 순, 같으면 최근 순 */
const rank = <T extends { count: number; last: string }>(a: T, b: T) => b.count - a.count || b.last.localeCompare(a.last);

/**
 * 자주 쓰는 지출 (같은 메모·카테고리·금액). 따로 등록하지 않아도 기록에서 자동으로 고른다.
 * 식단 장보기는 매번 달라서 뺀다. 메모가 없는 것도 뺀다(버튼 이름이 없으니까).
 */
export function frequentExpenses(expenses: Expense[], limit = 6): FavExpense[] {
  const map = new Map<string, FavExpense>();
  for (const e of expenses) {
    if (e.category === '식단' || !e.memo.trim()) continue;
    const key = `${e.memo.trim()}|${e.category}|${e.amount}`;
    const cur = map.get(key);
    if (cur) {
      cur.count++;
      if (e.date > cur.last) cur.last = e.date;
    } else map.set(key, { memo: e.memo.trim(), category: e.category, amount: e.amount, count: 1, last: e.date });
  }
  return [...map.values()].filter((x) => x.count >= 2).sort(rank).slice(0, limit); // 두 번 이상 쓴 것만 '자주'
}

/** 자주 먹은 계획 밖 음식 (같은 이름·칼로리) */
export function frequentExtras(intakes: IntakeLog[], limit = 6): FavExtra[] {
  const map = new Map<string, FavExtra>();
  for (const log of intakes) {
    for (const x of log.extras ?? ([] as IntakeExtra[])) {
      const key = `${x.name}|${x.kcal}|${x.protein}`;
      const cur = map.get(key);
      if (cur) {
        cur.count++;
        if (log.date > cur.last) cur.last = log.date;
      } else map.set(key, { name: x.name, kcal: x.kcal, protein: x.protein, count: 1, last: log.date });
    }
  }
  return [...map.values()].filter((x) => x.count >= 2).sort(rank).slice(0, limit);
}

import type { DinnerChoice, Expense, FinishEvent, ISODate, PurchaseLine, Settings } from '../domain/types';
import type { AppDB } from './db';

export const newId = (): string => crypto.randomUUID();

export async function recordExpense(db: AppDB, e: Omit<Expense, 'id'>): Promise<string> {
  if (!Number.isInteger(e.amount) || e.amount <= 0) throw new Error('금액은 1원 이상 정수여야 해요.');
  const id = newId();
  await db.expenses.put({ ...e, id });
  return id;
}

/** 식단 구매 1건 = Purchase 1 + '식단' Expense 1 + 품목별 재고 증가 + 가격 이력. */
export async function recordPurchase(
  db: AppDB,
  p: { date: ISODate; lines: PurchaseLine[]; memo?: string; source?: 'purchase' | 'capture' },
): Promise<{ purchaseId: string; expenseId: string }> {
  if (p.lines.length === 0) throw new Error('구매 품목이 없어요.');
  const total = p.lines.reduce((s, l) => s + l.price, 0);
  if (!(total > 0)) throw new Error('구매 금액을 확인해 주세요.');
  const purchaseId = newId();
  const expenseId = newId();
  await db.transaction('rw', db.expenses, db.purchases, db.stockEvents, db.prices, async () => {
    await db.expenses.put({
      id: expenseId, date: p.date, amount: total, category: '식단', memo: p.memo ?? '식단 구매', source: p.source ?? 'purchase',
    });
    await db.purchases.put({ id: purchaseId, date: p.date, lines: p.lines, total, expenseId });
    for (const l of p.lines) {
      await db.stockEvents.put({ id: newId(), foodId: l.foodId, date: p.date, type: 'purchase', qty: l.qtyAdded });
      if (l.packs > 0) {
        await db.prices.put({ id: newId(), foodId: l.foodId, date: p.date, packLabel: l.packLabel, price: Math.round(l.price / l.packs) });
      }
    }
  });
  return { purchaseId, expenseId };
}

/** 지출 삭제. 식단 구매라면 연결된 Purchase와 그 재고 증가분도 함께 지운다. */
export async function deleteExpense(db: AppDB, expenseId: string): Promise<void> {
  await db.transaction('rw', db.expenses, db.purchases, db.stockEvents, async () => {
    const p = await db.purchases.filter((x) => x.expenseId === expenseId).first();
    if (p) {
      for (const l of p.lines) {
        const ev = await db.stockEvents
          .where('foodId').equals(l.foodId)
          .filter((e) => e.date === p.date && e.type === 'purchase' && e.qty === l.qtyAdded)
          .first();
        if (ev) await db.stockEvents.delete(ev.id);
      }
      await db.purchases.delete(p.id);
    }
    await db.expenses.delete(expenseId);
  });
}

export async function recordFinish(db: AppDB, f: Omit<FinishEvent, 'id'>): Promise<void> {
  if (f.endDate < f.startDate) throw new Error('다 먹은 날이 시작일보다 빨라요.');
  if (!(f.qty > 0)) throw new Error('먹은 양을 확인해 주세요.');
  await db.finishes.put({ ...f, id: newId() });
}

export async function adjustStock(db: AppDB, foodId: string, date: ISODate, qty: number): Promise<void> {
  if (!(qty >= 0)) throw new Error('재고는 0 이상이어야 해요.');
  await db.stockEvents.put({ id: newId(), foodId, date, type: 'adjust', qty });
}

export async function setDinner(db: AppDB, date: ISODate, choice: DinnerChoice): Promise<void> {
  await db.dinners.put({ date, choice });
}

export async function logWeight(db: AppDB, date: ISODate, kg: number): Promise<void> {
  if (!(kg > 20 && kg < 300)) throw new Error('체중 값을 확인해 주세요.');
  await db.weights.put({ date, kg: Math.round(kg * 10) / 10 });
}

export async function updateSettings(db: AppDB, patch: Partial<Settings>): Promise<void> {
  await db.settings.update('settings', patch);
}

import type { DinnerChoice, Expense, FinishEvent, IntakeExtra, IntakeLog, ISODate, MealStatus, PurchaseLine, Settings } from '../domain/types';
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

/** 하루 끼니 기록. status=null이면 그 끼니 체크를 지운다. 음식별 입력도 함께 초기화된다. */
export async function setMealStatus(db: AppDB, date: ISODate, meal: string, status: MealStatus | null): Promise<void> {
  await updateIntake(db, date, (log) => {
    if (status === null) delete log.meals[meal];
    else log.meals[meal] = status;
    if (log.items) delete log.items[meal];
  });
}

/** 하루 끼니를 한 번에 '다 먹음'으로 (추가 음식은 유지). */
/** 그 전날 체크한 끼니를 그대로 가져온다 (추가 음식은 빼고). 전날 기록이 없으면 false. */
export async function copyDayMeals(db: AppDB, from: ISODate, to: ISODate): Promise<boolean> {
  const src = await db.intakes.get(from);
  if (!src || (Object.keys(src.meals).length === 0 && Object.keys(src.items ?? {}).length === 0)) return false;
  const dinner = await db.dinners.get(from);
  if (dinner) await db.dinners.put({ date: to, choice: dinner.choice });
  await updateIntake(db, to, (log) => {
    log.meals = { ...src.meals };
    log.items = src.items ? structuredClone(src.items) : undefined;
    if (!log.items) delete log.items;
  });
  return true;
}

export async function markAllEaten(db: AppDB, date: ISODate, mealNames: string[]): Promise<void> {
  await updateIntake(db, date, (log) => {
    log.meals = Object.fromEntries(mealNames.map((m) => [m, 'all' as const]));
    delete log.items;
  });
}

/**
 * 끼니 안의 음식 하나의 실제 먹은 양. 그 끼니를 처음 음식별로 바꾸면 initial로 다른 음식 양을 채운다.
 */
export async function setItemQty(
  db: AppDB, date: ISODate, meal: string, foodId: string, qty: number, initial: Record<string, number>,
): Promise<void> {
  if (!(qty >= 0) || qty > 10000) throw new Error('양을 확인해 주세요.');
  await updateIntake(db, date, (log) => {
    const items = { ...(log.items ?? {}) };
    items[meal] = { ...(items[meal] ?? initial), [foodId]: Math.round(qty * 100) / 100 };
    // 체크를 전부 풀면 '0% 먹은 끼니'가 아니라 '기록 안 함'으로 되돌린다
    if (Object.values(items[meal]).every((q) => q === 0)) delete items[meal];
    log.items = items;
    delete log.meals[meal];
  });
}

export async function addExtra(db: AppDB, date: ISODate, extra: Omit<IntakeExtra, 'id'>): Promise<void> {
  if (!extra.name.trim()) throw new Error('음식 이름을 적어 주세요.');
  if (!(extra.kcal >= 0 && extra.kcal < 5000) || !(extra.protein >= 0 && extra.protein < 300)) throw new Error('칼로리·단백질 값을 확인해 주세요.');
  await updateIntake(db, date, (log) => {
    log.extras = [...(log.extras ?? []), { ...extra, name: extra.name.trim(), id: newId() }];
  });
}

export async function removeExtra(db: AppDB, date: ISODate, id: string): Promise<void> {
  await updateIntake(db, date, (log) => {
    log.extras = (log.extras ?? []).filter((e) => e.id !== id);
  });
}

async function updateIntake(db: AppDB, date: ISODate, fn: (log: IntakeLog) => void): Promise<void> {
  await db.transaction('rw', db.intakes, async () => {
    const cur = await db.intakes.get(date);
    const log: IntakeLog = cur ? structuredClone(cur) : { date, meals: {} };
    fn(log);
    if (log.items && Object.keys(log.items).length === 0) delete log.items;
    if (log.extras && log.extras.length === 0) delete log.extras;
    if (Object.keys(log.meals).length === 0 && !log.items && !log.extras) await db.intakes.delete(date);
    else await db.intakes.put(log);
  });
}

export async function deleteWeight(db: AppDB, date: ISODate): Promise<void> {
  await db.weights.delete(date);
}

export async function logWeight(db: AppDB, date: ISODate, kg: number): Promise<void> {
  if (!(kg > 20 && kg < 300)) throw new Error('체중 값을 확인해 주세요.');
  await db.weights.put({ date, kg: Math.round(kg * 10) / 10 });
}

/** 주간 체크인: 고른 대로 칼로리 목표를 바꾸고 기록한다. 한 주에 한 번, 한 번에 최대 ±250kcal. */
export async function weeklyCheckin(db: AppDB, week: ISODate, choice: 'apply' | 'keep' | 'ok', delta: number): Promise<number> {
  const d = choice === 'apply' ? Math.max(-250, Math.min(250, delta)) : 0;
  let after = 0;
  await db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get('settings'))!;
    if ((s.checkins ?? []).some((c) => c.week === week)) {
      after = s.kcalTarget;
      return;
    }
    after = Math.max(1500, s.kcalTarget + d);
    await db.settings.put({ ...s, kcalTarget: after, checkins: [...(s.checkins ?? []), { week, choice, delta: d, kcalAfter: after, at: new Date().toISOString() }] });
  });
  return after;
}

export async function updateSettings(db: AppDB, patch: Partial<Settings>): Promise<void> {
  await db.settings.update('settings', patch);
}

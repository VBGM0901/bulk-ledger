import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { ensureDefaults } from '../db/backup';
import { db } from '../db/db';
import { balanceNow, summarizeBudget } from '../domain/budget';
import { estimateStock, measuredDailyUse } from '../domain/consumption';
import { budgetPeriod, daysBetween, todayISO } from '../domain/dates';
import { dailyQtyByFood, planFoodPurchases } from '../domain/foodPlan';
import { dailyNutrition } from '../domain/nutrition';
import { dayIntake, recentIntakePct } from '../domain/intake';
import { bulkAdvice } from '../domain/weight';
import { planShopping } from '../domain/shopping';
import type {
  DinnerChoice, DinnerLog, Expense, FinishEvent, FoodItem, IntakeLog, ISODate, Income, Purchase, RecurringExpense, Settings, StockEvent, WeightLog,
} from '../domain/types';

export interface RawData {
  settings: Settings;
  foods: FoodItem[];
  incomes: Income[];
  recurring: RecurringExpense[];
  expenses: Expense[];
  purchases: Purchase[];
  stockEvents: StockEvent[];
  weights: WeightLog[];
  dinners: DinnerLog[];
  finishes: FinishEvent[];
  intakes: IntakeLog[];
}

/** 모든 화면이 쓰는 파생 값. 순수 함수라 테스트 가능. */
export function deriveAppData(raw: RawData, today: ISODate) {
  const { settings, foods } = raw;
  const period = budgetPeriod(today, settings.payday);
  const plan = planFoodPurchases(foods, settings.meals, period.days);
  const summary = summarizeBudget({
    incomes: raw.incomes, recurring: raw.recurring, foodPlan: plan.total, expenses: raw.expenses, period, today,
  });
  const dinnerToday: DinnerChoice = raw.dinners.find((d) => d.date === today)?.choice ?? 'meat';
  const nutrition = dailyNutrition(foods, settings.meals, settings.dinner[dinnerToday]);
  const dailyPlan = dailyQtyByFood(settings.meals);
  // 사용자 결정: "웬만하면 다 먹는다" → 재고·장보기는 계획량 기준, 실측은 비교용으로만 표시
  const dailyUse = dailyPlan;
  const measured: Record<string, number | null> = {};
  const stock: Record<string, number> = {};
  for (const f of foods) {
    measured[f.id] = measuredDailyUse(raw.finishes, f.id);
    stock[f.id] = estimateStock(raw.stockEvents, f.id, dailyUse[f.id] ?? 0, today);
  }
  const shopping = planShopping({ foods, dailyUse, stock });
  const last = settings.lastBackupAt ? todayISO(new Date(settings.lastBackupAt)) : null; // 한국 날짜 기준
  // 백업한 적이 없으면, 앱에 처음 기록한 날부터 7일이 지나야 경고 (설치 직후엔 경고 안 함)
  const firstRecord = [...raw.weights, ...raw.expenses, ...raw.purchases, ...raw.dinners, ...raw.intakes]
    .map((r) => r.date)
    .sort()[0];
  const since = last ?? firstRecord ?? null;
  const backupStale = since !== null && daysBetween(since, today) > 7;
  const paidIds = settings.paidFixed?.period === period.start ? settings.paidFixed.ids : [];
  const unpaidFixed = raw.recurring.filter((r) => !paidIds.includes(r.id)).reduce((t, r) => t + (r.monthlyBudget ?? 0), 0);
  const foodLeft = Math.max(0, plan.total - summary.foodSpent);
  const balance = balanceNow(settings.balance, raw.expenses, period, today, { unpaidFixed, foodLeft });
  const todayIntake = dayIntake(today, foods, settings, raw.dinners, raw.intakes);
  const recentIntake = recentIntakePct(today, 7, foods, settings, raw.dinners, raw.intakes);
  const advice = bulkAdvice(raw.weights, settings.weightGoal, today, recentIntake?.pct ?? null);
  const needsSetup = raw.incomes.length === 0 && raw.recurring.length === 0;
  return {
    today, ...raw, period, plan, summary, dinnerToday, nutrition, dailyPlan, dailyUse, measured, stock, shopping, backupStale, needsSetup, balance, paidIds, todayIntake, recentIntake, advice,
  };
}
export type AppData = ReturnType<typeof deriveAppData>;

export function useAppData(): AppData | null {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    ensureDefaults(db).then(() => setReady(true));
    // 앱을 켜 둔 채 날짜가 바뀌거나 다시 앞으로 나올 때 오늘 날짜 갱신
    const refresh = () => setToday(todayISO());
    document.addEventListener('visibilitychange', refresh);
    const t = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(t);
    };
  }, []);
  const raw = useLiveQuery(async () => {
    if (!ready) return null;
    const settings = await db.settings.get('settings');
    if (!settings) return null;
    const [foods, incomes, recurring, expenses, purchases, stockEvents, weights, dinners, finishes, intakes] = await Promise.all([
      db.foods.toArray(), db.incomes.toArray(), db.recurring.toArray(), db.expenses.toArray(), db.purchases.toArray(),
      db.stockEvents.toArray(), db.weights.orderBy('date').toArray(), db.dinners.toArray(), db.finishes.toArray(), db.intakes.toArray(),
    ]);
    return { settings, foods, incomes, recurring, expenses, purchases, stockEvents, weights, dinners, finishes, intakes };
  }, [ready]);
  if (!ready || !raw) return null;
  return deriveAppData(raw, today);
}

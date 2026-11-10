import { daysInclusive, type Period } from './dates';
import type { Expense, ISODate, Income, RecurringExpense } from './types';

export interface BudgetSummary {
  income: number;
  fixed: number;
  foodPlan: number;
  foodSpent: number;
  otherSpent: number;
  remaining: number;
  daysLeft: number;
  dailyAllowance: number;
  missing: string[];
  overBudget: boolean;
  byCategory: Record<string, number>;
}

/**
 * 남은 예산 = 수입 − 고정비 − 식단 계획비 − (식단 외) 실제 지출.
 * 식단 구매 지출('식단')은 계획비와 비교만 하고 다시 빼지 않는다 (이중 집계 방지).
 */
export function summarizeBudget(input: {
  incomes: Income[];
  recurring: RecurringExpense[];
  foodPlan: number;
  expenses: Expense[];
  period: Period;
  today: ISODate;
}): BudgetSummary {
  const { incomes, recurring, foodPlan, expenses, period, today } = input;
  const missing = [
    ...incomes.filter((i) => i.amount === null).map((i) => i.name),
    ...recurring.filter((r) => r.monthlyBudget === null).map((r) => r.name),
  ];
  const income = incomes.reduce((s, i) => s + (i.amount ?? 0), 0);
  const fixed = recurring.reduce((s, r) => s + (r.monthlyBudget ?? 0), 0);
  const inPeriod = expenses.filter((e) => e.date >= period.start && e.date <= period.end);
  const byCategory: Record<string, number> = {};
  for (const e of inPeriod) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  const foodSpent = byCategory['식단'] ?? 0;
  const otherSpent = inPeriod.filter((e) => e.category !== '식단').reduce((s, e) => s + e.amount, 0);
  // 식단은 계획만큼 미리 잡아 두고, 계획보다 더 샀으면 실제 구매액으로 뺀다
  const remaining = income - fixed - Math.max(foodPlan, foodSpent) - otherSpent;
  const daysLeft = Math.max(1, Math.min(period.days, daysInclusive(today, period.end)));
  return {
    income,
    fixed,
    foodPlan,
    foodSpent,
    otherSpent,
    remaining,
    daysLeft,
    dailyAllowance: Math.floor(Math.max(0, remaining) / daysLeft),
    missing,
    overBudget: remaining < 0,
    byCategory,
  };
}

export interface Balance { amount: number; date: ISODate }
export interface BalanceNow {
  /** 입력한 금액 − 그 다음 날부터 오늘까지 기록한 지출 */
  now: number;
  /** 남은 날로 나눈 하루 쓸 수 있는 돈 */
  daily: number;
  since: ISODate;
  spentSince: number;
}

/**
 * 사용자가 직접 넣은 '지금 남은 돈'. 이번 예산월 안에서 넣은 값만 쓴다 (월급날이 지나면 다시 넣어야 함).
 * 입력한 날의 지출은 이미 반영됐다고 보고, 그 다음 날부터 기록한 지출만 뺀다.
 */
export function balanceNow(b: Balance | null | undefined, expenses: Expense[], period: Period, today: ISODate): BalanceNow | null {
  if (!b || b.date < period.start || b.date > today) return null;
  const spentSince = expenses.filter((e) => e.date > b.date && e.date <= today).reduce((t, e) => t + e.amount, 0);
  const now = b.amount - spentSince;
  const daysLeft = Math.max(1, Math.min(period.days, daysInclusive(today, period.end)));
  return { now, daily: Math.floor(Math.max(0, now) / daysLeft), since: b.date, spentSince };
}

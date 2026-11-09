import { summarizeBudget } from './budget';
import type { Expense, Income, RecurringExpense } from './types';

const incomes: Income[] = [{ id: 'i', name: '월급', amount: 3_000_000 }];
const recurring: RecurringExpense[] = [
  { id: 'a', name: '월세', category: '고정', monthlyBudget: 1_000_000, dueDay: null, memo: '' },
  { id: 'b', name: '통신비', category: '고정', monthlyBudget: 150_000, dueDay: null, memo: '' },
  { id: 'c', name: '보험', category: '고정', monthlyBudget: 150_000, dueDay: null, memo: '' },
  { id: 'd', name: '구독', category: '고정', monthlyBudget: 100_000, dueDay: null, memo: '' },
  { id: 'e', name: '교통비', category: '고정', monthlyBudget: 100_000, dueDay: null, memo: '' },
];
const period = { start: '2026-11-10', end: '2026-12-09', days: 30 };
const ex = (date: string, amount: number, category: Expense['category']): Expense => ({
  id: date + amount, date, amount, category, memo: '', source: 'manual',
});

test('baseline 1,216,380 remaining', () => {
  const s = summarizeBudget({ incomes, recurring, foodPlan: 283_620, expenses: [], period, today: '2026-11-10' });
  expect(s.fixed).toBe(1_500_000);
  expect(s.remaining).toBe(1_216_380);
  expect(s.daysLeft).toBe(30);
  expect(s.dailyAllowance).toBe(40_546);
});

test('food purchases are compared, not double-subtracted; other spending reduces remaining', () => {
  const s = summarizeBudget({
    incomes, recurring, foodPlan: 283_620, period, today: '2026-11-10',
    expenses: [ex('2026-11-10', 50_000, '식단'), ex('2026-11-10', 10_000, '저녁식비'), ex('2026-11-09', 99_999, '여가')],
  });
  expect(s.foodSpent).toBe(50_000);
  expect(s.otherSpent).toBe(10_000);
  expect(s.remaining).toBe(1_206_380);
  expect(s.dailyAllowance).toBe(40_212);
  expect(s.byCategory).toEqual({ 식단: 50_000, 저녁식비: 10_000 });
});

test('missing amounts are flagged, counted as 0', () => {
  const s = summarizeBudget({
    incomes: [{ id: 'i', name: '월급', amount: null }], recurring, foodPlan: 0, expenses: [], period, today: '2026-11-10',
  });
  expect(s.missing).toEqual(['월급']);
  expect(s.overBudget).toBe(true);
  expect(s.dailyAllowance).toBe(0);
});

test('last day of period has 1 day left', () => {
  expect(summarizeBudget({ incomes, recurring, foodPlan: 0, expenses: [], period, today: '2026-12-09' }).daysLeft).toBe(1);
});

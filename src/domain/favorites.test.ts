import { frequentExpenses, frequentExtras } from './favorites';
import type { Expense } from './types';

const e = (id: string, date: string, memo: string, amount: number, category: Expense['category'] = '추가식품'): Expense =>
  ({ id, date, amount, category, memo, source: 'manual' });

test('most used first, then most recent; food purchases and blank memos are skipped', () => {
  const r = frequentExpenses([
    e('1', '2026-11-01', '삼각김밥', 1500), e('2', '2026-11-03', '삼각김밥', 1500), e('3', '2026-11-05', '커피', 2000),
    e('4', '2026-11-06', '바나나', 2990, '식단'), e('5', '2026-11-07', '', 3000), e('6', '2026-11-08', '삼각김밥', 1800),
  ]);
  expect(r.map((x) => `${x.memo}${x.amount}`)).toEqual(['삼각김밥1500']); // 한 번만 쓴 건 '자주'가 아님
  expect(r[0].count).toBe(2);
});

test('frequent extra foods across days', () => {
  const r = frequentExtras([
    { date: '2026-11-01', meals: {}, extras: [{ id: 'a', name: '라면', kcal: 500, protein: 10 }] },
    { date: '2026-11-02', meals: {}, extras: [{ id: 'b', name: '라면', kcal: 500, protein: 10 }, { id: 'c', name: '김밥', kcal: 300, protein: 8 }] },
  ]);
  expect(r.map((x) => x.name)).toEqual(['라면']);
});

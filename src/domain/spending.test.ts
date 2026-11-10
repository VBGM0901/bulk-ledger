import { compactKRW, spendByDay } from './spending';
import type { Expense } from './types';

const e = (date: string, amount: number, category: Expense['category']): Expense => ({ id: `${date}${amount}`, date, amount, category, memo: '', source: 'manual' });

test('splits food vs other, marks big days and no-spend days', () => {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
  const r = spendByDay([e('2026-11-09', 50_000, '식단'), e('2026-11-10', 1500, '추가식품'), e('2026-11-11', 40_000, '여가')], days, '2026-11-12', 13_000, '2026-11-09');
  expect(r['2026-11-09']).toMatchObject({ food: 50_000, other: 0, noSpend: true, big: false }); // 장보기만 한 날은 무지출
  expect(r['2026-11-10']).toMatchObject({ other: 1500, noSpend: false, big: false });
  expect(r['2026-11-11']).toMatchObject({ other: 40_000, big: true }); // 하루 가능 금액 2배(26,000) 초과
  expect(r['2026-11-12'].noSpend).toBe(false); // 오늘은 아직 무지출로 안 셈
});

test('compact amounts fit a calendar cell', () => {
  expect(compactKRW(0)).toBe('');
  expect(compactKRW(1500)).toBe('1.5천');
  expect(compactKRW(35_000)).toBe('3.5만');
  expect(compactKRW(120_000)).toBe('12만');
});

test('no stamps before the app was first used', () => {
  const r = spendByDay([], ['2026-11-01', '2026-11-10'], '2026-11-10', 13_000, '2026-11-09');
  expect(r['2026-11-01'].noSpend).toBe(false);
  expect(r['2026-11-10'].noSpend).toBe(false); // 오늘은 아직 안 끝남
  expect(spendByDay([], ['2026-11-09'], '2026-11-10', 13_000, '2026-11-09')['2026-11-09'].noSpend).toBe(true);
  expect(spendByDay([], ['2026-11-10'], '2026-11-10', 13_000, null)['2026-11-10'].noSpend).toBe(false);
});

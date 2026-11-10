import type { Expense, ISODate } from './types';

export interface DaySpend {
  date: ISODate;
  /** 그날 쓴 돈 전체 */
  total: number;
  /** 식단 구매 (계획된 장보기) */
  food: number;
  /** 식단 외 지출 */
  other: number;
  /** 식단 외로 평소보다 크게 쓴 날 */
  big: boolean;
  /** 지난 날 중 식단 외 지출이 0원인 날 (장보기는 계획이라 빼고 본다) */
  noSpend: boolean;
}

/**
 * 날짜별 지출. '큰 지출'은 식단 외 지출이 하루 사용 가능 금액의 2배(최소 1만원)를 넘는 날.
 * 무지출 도장은 앱을 쓰기 시작한 날(since)부터 오늘까지만 찍는다.
 */
export function spendByDay(
  expenses: Expense[], days: ISODate[], today: ISODate, dailyAllowance: number, since: ISODate | null = null,
): Record<ISODate, DaySpend> {
  const bigLine = Math.max(10_000, dailyAllowance * 2);
  const out: Record<ISODate, DaySpend> = {};
  for (const date of days) {
    const list = expenses.filter((e) => e.date === date);
    const food = list.filter((e) => e.category === '식단').reduce((s, e) => s + e.amount, 0);
    const other = list.filter((e) => e.category !== '식단').reduce((s, e) => s + e.amount, 0);
    out[date] = { date, total: food + other, food, other, big: other > bigLine, noSpend: date <= today && since !== null && date >= since && other === 0 };
  }
  return out;
}

/** 달력 칸에 들어갈 짧은 금액: 1,500 → 1.5천, 35,000 → 3.5만, 120,000 → 12만 */
export function compactKRW(n: number): string {
  if (n <= 0) return '';
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
  if (n < 10_000) return `${trim(n / 1000)}천`;
  if (n < 100_000) return `${trim(n / 10_000)}만`;
  return `${Math.round(n / 10_000)}만`;
}

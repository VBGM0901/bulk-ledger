import { addDays, daysBetween, daysInclusive } from './dates';
import type { FinishEvent, ISODate, StockEvent } from './types';

/** "다 먹었음" 기록들로 본 실측 하루 섭취량 (총량 ÷ 총 달력 일수). */
export function measuredDailyUse(finishes: FinishEvent[], foodId: string): number | null {
  const mine = finishes.filter((f) => f.foodId === foodId);
  if (!mine.length) return null;
  const qty = mine.reduce((s, f) => s + f.qty, 0);
  const days = mine.reduce((s, f) => s + daysInclusive(f.startDate, f.endDate), 0);
  return days > 0 ? qty / days : null;
}

/** 구매·조정 이벤트에서 하루 사용량을 빼 가며 추정한 오늘 재고 (0 미만 없음). */
export function estimateStock(events: StockEvent[], foodId: string, dailyUse: number, today: ISODate): number {
  const mine = events
    .filter((e) => e.foodId === foodId && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  let stock = 0;
  let cursor: ISODate | null = null;
  for (const e of mine) {
    if (cursor) stock = Math.max(0, stock - dailyUse * daysBetween(cursor, e.date));
    stock = e.type === 'adjust' ? e.qty : stock + e.qty;
    cursor = e.date;
  }
  if (cursor) stock = Math.max(0, stock - dailyUse * daysBetween(cursor, today));
  return Math.round(stock * 10) / 10;
}

export function depletionDate(stock: number, dailyUse: number, today: ISODate): ISODate | null {
  if (dailyUse <= 0) return null;
  return addDays(today, Math.floor(stock / dailyUse));
}

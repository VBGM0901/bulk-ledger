import { addDays, daysBetween } from './dates';
import type { ISODate, WeightGoal, WeightLog } from './types';

export function movingAverage(logs: WeightLog[], date: ISODate, window = 7): number | null {
  const from = addDays(date, -(window - 1));
  const xs = logs.filter((l) => l.date >= from && l.date <= date).map((l) => l.kg);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

export function goalWeightOn(goal: WeightGoal, date: ISODate): number {
  const total = daysBetween(goal.startDate, goal.endDate);
  if (total <= 0) return goal.targetKg;
  const t = Math.min(1, Math.max(0, daysBetween(goal.startDate, date) / total));
  return goal.startKg + (goal.targetKg - goal.startKg) * t;
}

/** 오늘 7일 평균 − 7일 전 7일 평균. */
export function weeklyRate(logs: WeightLog[], today: ISODate): number | null {
  const now = movingAverage(logs, today);
  const prev = movingAverage(logs, addDays(today, -7));
  return now === null || prev === null ? null : now - prev;
}

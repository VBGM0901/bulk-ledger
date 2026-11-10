import { addDays, daysBetween } from './dates';
import { dayIntake } from './intake';
import type { DinnerLog, FoodItem, IntakeLog, ISODate, Settings, WeightGoal, WeightLog } from './types';
import { movingAverage } from './weight';

type S = Pick<Settings, 'meals' | 'dinner' | 'kcalTarget'> & Partial<Pick<Settings, 'checkins'>>;

/**
 * 잘 먹은 날(95% 이상) 연속 기록. 오늘이 아직 안 끝났으면 어제부터 센다(오늘 못 채웠다고 끊기지 않게).
 * best = 지금까지 가장 긴 연속.
 */
export function eatingStreak(today: ISODate, foods: FoodItem[], s: S, dinners: DinnerLog[], intakes: IntakeLog[]): { current: number; best: number } {
  const good = (d: ISODate) => dayIntake(d, foods, s, dinners, intakes)?.grade === 'good';
  let current = 0;
  let d = good(today) ? today : addDays(today, -1);
  while (good(d)) {
    current++;
    d = addDays(d, -1);
  }
  const dates = intakes.map((l) => l.date).filter((x) => x <= today).sort();
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const x of dates) {
    if (!good(x)) {
      run = 0;
      prev = x;
      continue;
    }
    run = prev && daysBetween(prev, x) === 1 && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current) };
}

/** 목표 체중까지 진행 (7일 평균 기준). 기록이 없으면 null */
export function goalProgress(logs: WeightLog[], goal: WeightGoal | null, today: ISODate): { now: number; pct: number; left: number } | null {
  if (!goal) return null;
  const now = movingAverage(logs, today);
  if (now === null) return null;
  const span = goal.targetKg - goal.startKg;
  const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, ((now - goal.startKg) / span) * 100));
  return { now, pct, left: Math.max(0, goal.targetKg - now) };
}

/**
 * 1kg 단위 달성: 7일 평균이 처음으로 (시작 + n)kg을 넘은 날. 가장 최근 달성을 돌려주고,
 * 그날부터 3일 동안만 축하를 띄운다.
 */
export function recentMilestone(logs: WeightLog[], goal: WeightGoal | null, today: ISODate): { gained: number; kg: number; on: ISODate } | null {
  if (!goal || logs.length === 0) return null;
  const first = [...logs].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  let hit: { gained: number; kg: number; on: ISODate } | null = null;
  let reached = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const avg = movingAverage(logs, d);
    if (avg === null) continue;
    const n = Math.floor(avg - goal.startKg + 1e-9);
    if (n > reached) {
      reached = n;
      hit = { gained: n, kg: goal.startKg + n, on: d };
    }
  }
  return hit && daysBetween(hit.on, today) <= 3 ? hit : null;
}

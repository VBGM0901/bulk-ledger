import { addDays, dow } from './dates';
import { dayIntake } from './intake';
import type { DinnerLog, FoodItem, IntakeLog, ISODate, Settings, WeightLog } from './types';
import type { BulkAdvice } from './weight';

/** 그 주 월요일 */
export const weekStart = (d: ISODate): ISODate => addDays(d, -((dow(d) + 6) % 7));

export interface WeeklyReview {
  week: ISODate;
  /** 어제까지 최근 7일 */
  goodDays: number;
  loggedDays: number;
  avgPct: number | null;
  weighIns: number;
  /** 버튼으로 고를 수 있는 칼로리 변경 (0이면 확인만) */
  delta: number;
  done: boolean;
}

/**
 * 주간 체크인: 지난 7일을 돌아보고, 제안(+250 / −200 / 유지)을 버튼 한 번으로 정한다.
 * 이번 주에 이미 했거나, 지난 7일에 기록이 하나도 없으면 띄우지 않는다.
 */
export function weeklyReview(
  today: ISODate,
  s: Pick<Settings, 'meals' | 'dinner' | 'kcalTarget' | 'checkins'>,
  foods: FoodItem[], dinners: DinnerLog[], intakes: IntakeLog[], weights: WeightLog[], advice: BulkAdvice,
): WeeklyReview | null {
  const week = weekStart(today);
  const done = (s.checkins ?? []).some((c) => c.week === week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
  const logs = days.map((d) => dayIntake(d, foods, s, dinners, intakes)).filter((x) => x !== null);
  const weighIns = weights.filter((w) => days.includes(w.date)).length;
  if (logs.length === 0 && weighIns === 0) return null;
  const avgPct = logs.length ? logs.reduce((t, x) => t + x.pct, 0) / logs.length : null;
  const delta = advice.kind === 'add' ? 250 : advice.kind === 'too-fast' ? -200 : 0;
  return { week, goodDays: logs.filter((x) => x.grade === 'good').length, loggedDays: logs.length, avgPct, weighIns, delta, done };
}

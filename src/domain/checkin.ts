import { addDays, dow, todayISO } from './dates';
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
 * 이번 주에 이미 했거나, 지난 7일 기록이 너무 적으면(식사 3일·체중 3번 미만) 띄우지 않는다.
 */
export function weeklyReview(
  today: ISODate,
  s: Pick<Settings, 'meals' | 'dinner' | 'kcalTarget' | 'checkins'>,
  foods: FoodItem[], dinners: DinnerLog[], intakes: IntakeLog[], weights: WeightLog[], advice: BulkAdvice,
): WeeklyReview | null {
  const week = weekStart(today);
  // 이번 주에 했거나, 마지막 체크인이 7일이 안 됐으면 (일요일에 하고 월요일에 또 +250 방지)
  const recent = (s.checkins ?? []).some((c) => c.week === week || todayISO(new Date(c.at)) > addDays(today, -7));
  const done = recent;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
  const logs = days.map((d) => dayIntake(d, foods, s, dinners, intakes)).filter((x) => x !== null);
  const weighIns = weights.filter((w) => days.includes(w.date)).length;
  // 판단할 거리가 있을 때만 (식사 기록 3일 또는 체중 3번 이상). 이미 했으면 결과 안내는 계속 보여준다
  if (!done && logs.length < 3 && weighIns < 3) return null;
  const avgPct = logs.length ? logs.reduce((t, x) => t + x.pct, 0) / logs.length : null;
  const delta = advice.kind === 'add' ? 250 : advice.kind === 'too-fast' ? -200 : 0;
  return { week, goodDays: logs.filter((x) => x.grade === 'good').length, loggedDays: logs.length, avgPct, weighIns, delta, done };
}

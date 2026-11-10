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

export type AdviceKind = 'need-data' | 'eat-plan' | 'add' | 'on-track' | 'too-fast';
export interface BulkAdvice {
  kind: AdviceKind;
  /** 하루 칼로리를 얼마나 바꾸면 좋은지 (+면 늘리기) */
  kcalDelta: number;
  title: string;
  detail: string;
  /** 목표 달성에 필요한 주당 증가량(kg) */
  targetRate: number | null;
  rate: number | null;
}

/**
 * 체중 추세 + 식사 기록으로 "더 먹을지" 제안.
 * - 목표 속도의 절반도 안 늘면: 계획을 다 못 먹는 중이면 먼저 다 먹기, 다 먹는데도 안 늘면 +250kcal
 * - 주 0.75kg 넘게 늘면: 지방 위주일 수 있어 −200kcal
 * 근거: 일반적인 린 벌크 권장 속도(주 체중의 약 0.25~0.5%, 초보는 조금 더)와 1kg ≈ 7,700kcal 근사.
 */
export function bulkAdvice(
  logs: WeightLog[], goal: WeightGoal | null, today: ISODate, intakePct: number | null,
): BulkAdvice {
  const rate = weeklyRate(logs, today);
  const weeks = goal ? Math.max(1, daysBetween(goal.startDate, goal.endDate) / 7) : null;
  const targetRate = goal && weeks ? (goal.targetKg - goal.startKg) / weeks : null;
  const base = { rate, targetRate };
  if (rate === null) {
    return { ...base, kind: 'need-data', kcalDelta: 0, title: '2주 정도 기록이 더 필요해요', detail: '매일 아침 체중을 재면 7일 평균끼리 비교해서 더 먹을지 알려드려요.' };
  }
  const want = targetRate ?? 0.4;
  if (rate > Math.max(0.75, want * 1.6)) {
    return { ...base, kind: 'too-fast', kcalDelta: -200, title: '너무 빨리 늘고 있어요', detail: '지방 위주로 늘 수 있어요. 하루 200kcal 정도 줄여 보세요 (예: 오후 간식 땅콩버터 1스푼 빼기).' };
  }
  if (rate < want * 0.5) {
    if (intakePct !== null && intakePct < 0.9) {
      return { ...base, kind: 'eat-plan', kcalDelta: 0, title: '먼저 계획량을 다 먹는 게 우선이에요', detail: `최근 기록 평균 ${Math.round(intakePct * 100)}%만 먹었어요. 식단을 늘리기 전에 지금 계획부터 다 먹어 보세요.` };
    }
    return { ...base, kind: 'add', kcalDelta: 250, title: '하루 250kcal 더 먹어 보세요', detail: '다 먹는데도 잘 안 늘어요. 예: 바나나 1개 + 땅콩버터 1스푼(16g), 또는 식빵 1조각 + 땅콩버터 1스푼.' };
  }
  return { ...base, kind: 'on-track', kcalDelta: 0, title: '지금 페이스 좋아요', detail: '이대로 계속 먹으면 돼요.' };
}

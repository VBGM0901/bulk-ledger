import { addDays } from './dates';
import { dailyNutrition } from './nutrition';
import type { DinnerChoice, DinnerLog, FoodItem, IntakeLog, ISODate, MealStatus, Settings } from './types';

export const STATUS_FACTOR: Record<MealStatus, number> = { all: 1, half: 0.5, none: 0 };
export const STATUS_LABEL: Record<MealStatus, string> = { all: '다 먹음', half: '반쯤', none: '못 먹음' };

export type IntakeGrade = 'good' | 'ok' | 'low';

export interface DayIntake {
  date: ISODate;
  planKcal: number;
  planProtein: number;
  /** 체크한 끼니 기준으로 실제 먹은 양. 체크 안 한 끼니는 0으로 본다. */
  kcal: number;
  protein: number;
  /** kcal / 목표 kcal */
  pct: number;
  checked: number;
  total: number;
  grade: IntakeGrade;
}

export function gradeOf(pct: number): IntakeGrade {
  return pct >= 0.95 ? 'good' : pct >= 0.75 ? 'ok' : 'low';
}

/** 그날의 식사 기록 → 먹은 칼로리·단백질. 기록이 없으면 null. */
export function dayIntake(
  date: ISODate,
  foods: FoodItem[],
  settings: Pick<Settings, 'meals' | 'dinner' | 'kcalTarget'>,
  dinners: DinnerLog[],
  intakes: IntakeLog[],
): DayIntake | null {
  const log = intakes.find((l) => l.date === date);
  if (!log) return null;
  const choice: DinnerChoice = dinners.find((d) => d.date === date)?.choice ?? 'meat';
  const n = dailyNutrition(foods, settings.meals, settings.dinner[choice]);
  let kcal = 0;
  let protein = 0;
  let checked = 0;
  for (const m of n.byMeal) {
    const s = log.meals[m.name];
    if (!s) continue;
    checked++;
    kcal += m.kcal * STATUS_FACTOR[s];
    protein += m.protein * STATUS_FACTOR[s];
  }
  const pct = settings.kcalTarget > 0 ? kcal / settings.kcalTarget : 0;
  return {
    date, planKcal: n.kcal, planProtein: n.protein,
    kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10,
    pct, checked, total: n.byMeal.length, grade: gradeOf(pct),
  };
}

/** 최근 n일 중 기록한 날들의 평균 달성률. 기록한 날이 없으면 null. */
export function recentIntakePct(
  today: ISODate, days: number,
  foods: FoodItem[], settings: Pick<Settings, 'meals' | 'dinner' | 'kcalTarget'>, dinners: DinnerLog[], intakes: IntakeLog[],
): { pct: number; logged: number } | null {
  const xs: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = dayIntake(addDays(today, -i), foods, settings, dinners, intakes);
    if (d) xs.push(d.pct);
  }
  return xs.length ? { pct: xs.reduce((s, x) => s + x, 0) / xs.length, logged: xs.length } : null;
}

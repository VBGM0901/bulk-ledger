import { DEFAULT_FOODS, DEFAULT_SETTINGS } from '../domain/defaults';
import type { RawData } from './useAppData';

/** 테스트용 기본 원본 데이터 (개인 숫자는 테스트 안에서 넣는다). */
export function rawFixture(patch: Partial<RawData> = {}): RawData {
  return {
    settings: DEFAULT_SETTINGS,
    foods: DEFAULT_FOODS,
    incomes: [],
    recurring: [],
    expenses: [],
    purchases: [],
    stockEvents: [],
    weights: [],
    dinners: [],
    finishes: [],
    ...patch,
  };
}

export const SAMPLE_BUDGET: Partial<RawData> = {
  incomes: [{ id: 'i', name: '월급', amount: 3_000_000 }],
  recurring: [{ id: 'r', name: '고정 합계', category: '고정', monthlyBudget: 1_500_000, dueDay: null, memo: '' }],
};

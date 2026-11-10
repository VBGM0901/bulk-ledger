import type { FoodItem } from './types';

const SHORT: Record<string, string> = {
  rice: '닭가슴살 볶음밥', egg: '구운란', banana: '바나나', yogurt: '그릭요거트',
  bread: '식빵', pb: '땅콩버터', nuts: '견과류', juice: '과일주스',
};

/** 화면용 짧은 식품 이름 (긴 쿠팡 상품명 대신) */
export function shortName(f: Pick<FoodItem, 'id' | 'name'> | undefined): string {
  if (!f) return '삭제된 식품';
  return SHORT[f.id] ?? f.name;
}

/** 끼니 순서별 색 (CSS 변수 --meal-0 … --meal-5) */
export function mealColor(index: number): string {
  return `var(--meal-${index % 6})`;
}

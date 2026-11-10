export type ISODate = string; // 'YYYY-MM-DD'
export type Unit = '개' | '조각' | 'g' | '잔' | 'ml';
export type NutritionSource = 'label' | 'estimate';
export type PriceSource = 'user' | 'previous' | 'unverified';
export type ShippingGroup = 'rocketFresh' | 'sellerRocket' | 'sellerFree' | 'rocket' | 'none';

export interface PackOption { label: string; qty: number; price: number }
export interface FoodItem {
  id: string;
  name: string;
  url?: string;
  unit: Unit;
  perUnit: { kcal: number; protein: number };
  nutritionSource: { kcal: NutritionSource; protein: NutritionSource };
  packOptions: PackOption[];
  free: boolean;
  priceCheckedAt: ISODate | null;
  priceSource: PriceSource;
  shippingGroup: ShippingGroup;
}
export interface MealItem { foodId: string; qty: number }
export interface Meal { name: string; items: MealItem[] }
export type DinnerChoice = 'meat' | 'none' | 'less';

export interface Income { id: string; name: string; amount: number | null }
export interface RecurringExpense {
  id: string;
  name: string;
  category: string;
  monthlyBudget: number | null;
  dueDay: number | null;
  memo: string;
}
export const EXPENSE_CATEGORIES = ['식단', '저녁식비', '추가식품', '생활용품', '여가', '쇼핑', '기타', '비상지출'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export interface Expense {
  id: string;
  date: ISODate;
  amount: number;
  category: ExpenseCategory;
  memo: string;
  paymentMethod?: string;
  source: 'manual' | 'capture' | 'purchase';
}
export interface PurchaseLine { foodId: string; packLabel: string; packs: number; qtyAdded: number; price: number }
export interface Purchase { id: string; date: ISODate; lines: PurchaseLine[]; total: number; expenseId: string }
export interface StockEvent { id: string; foodId: string; date: ISODate; type: 'purchase' | 'adjust'; qty: number }
export interface FinishEvent { id: string; foodId: string; startDate: ISODate; endDate: ISODate; qty: number }
export interface WeightLog { date: ISODate; kg: number }
export interface DinnerLog { date: ISODate; choice: DinnerChoice }
/** 끼니별로 얼마나 먹었는지. all=다 먹음, half=반쯤, none=못 먹음 */
export type MealStatus = 'all' | 'half' | 'none';
/** 대화방에서 Claude가 기록한 것 하나 + 되돌리기 정보 */
export type UndoSpec =
  | { kind: 'expense'; expenseId: string }
  | { kind: 'intake'; date: ISODate; prev: IntakeLog | null } // 예전 기록용 (하루 전체 되돌림)
  | { kind: 'meals'; date: ISODate; prev: Record<string, { status?: MealStatus; items?: Record<string, number> }> }
  | { kind: 'extra'; date: ISODate; extraId: string }
  | { kind: 'weight'; date: ISODate; prev: number | null };
export interface ChatAction { summary: string; undo: UndoSpec; undone?: boolean }
/** Claude 대화방 메시지 (폰에만 저장). 사진은 저장하지 않고 hadImage만 남긴다. */
export interface ChatMessage {
  id: string;
  at: string;
  role: 'user' | 'assistant';
  content: string;
  hadImage?: boolean;
  actions?: ChatAction[];
}
/** 계획에 없던 음식 (편의점 간식 등). foodId가 있으면 등록된 식품 × qty. */
export interface IntakeExtra { id: string; name: string; kcal: number; protein: number; foodId?: string; qty?: number }
/**
 * 하루 식사 기록. meals의 키는 끼니 이름(아침·점심·저녁…). 체크 안 한 끼니는 키가 없다.
 * items[끼니][foodId] = 실제 먹은 양 (음식별로 입력한 끼니만). 저녁 집밥은 '__home' 키에 0~1 비율.
 * 같은 끼니에 items가 있으면 meals 상태보다 items가 우선한다.
 */
export interface IntakeLog {
  date: ISODate;
  meals: Record<string, MealStatus>;
  items?: Record<string, Record<string, number>>;
  extras?: IntakeExtra[];
}
export interface PriceHistory { id: string; foodId: string; date: ISODate; packLabel: string; price: number }
export interface WeightGoal { startKg: number; targetKg: number; startDate: ISODate; endDate: ISODate }
export interface Settings {
  id: 'settings';
  payday: number;
  kcalTarget: number;
  proteinTarget: [number, number];
  weightGoal: WeightGoal | null;
  apiKey: string;
  lastBackupAt: string | null;
  theme: 'light' | 'dark' | 'system';
  dinner: Record<DinnerChoice, { kcal: number; protein: number }>;
  meals: Meal[];
  /** 키·나이·운동 등 Claude에게 알려줄 개인 메모 (폰에만 저장). */
  profileNote: string;
  /** 기본 식단 변경을 몇 번째까지 적용했는지 (한 번만 적용하려고) */
  migratedV?: number;
  /** 직접 넣은 '지금 남은 돈' (넣은 날짜와 함께) */
  balance?: { amount: number; date: ISODate } | null;
  /** 주간 체크인 기록 (주 = 그 주 월요일) */
  checkins?: { week: ISODate; choice: 'apply' | 'keep' | 'ok'; delta: number; kcalAfter: number; at: string }[];
}

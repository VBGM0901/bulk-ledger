export type ISODate = string; // 'YYYY-MM-DD'
export type Unit = '개' | '조각' | 'g' | '잔';
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
export interface PriceHistory { id: string; foodId: string; date: ISODate; packLabel: string; price: number }
export interface WeightGoal { startKg: number; targetKg: number; startDate: ISODate; endDate: ISODate }
export interface Settings {
  id: 'settings';
  payday: number;
  kcalTarget: number;
  proteinTarget: [number, number];
  weightGoal: WeightGoal | null;
  logScope: 'food' | 'all';
  apiKey: string;
  lastBackupAt: string | null;
  theme: 'light' | 'dark' | 'system';
  dinner: Record<DinnerChoice, { kcal: number; protein: number }>;
  meals: Meal[];
  /** 키·나이·운동 등 Claude에게 알려줄 개인 메모 (폰에만 저장). */
  profileNote: string;
}

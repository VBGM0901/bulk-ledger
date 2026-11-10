import Dexie, { type Table } from 'dexie';
import type {
  DinnerLog, Expense, IntakeLog, FinishEvent, FoodItem, Income, PriceHistory, Purchase, RecurringExpense, Settings, StockEvent, WeightLog,
} from '../domain/types';

export const TABLES = [
  'settings', 'foods', 'incomes', 'recurring', 'expenses', 'purchases', 'stockEvents', 'finishes', 'weights', 'dinners', 'prices', 'intakes',
] as const;
export type TableName = (typeof TABLES)[number];

export class AppDB extends Dexie {
  settings!: Table<Settings, string>;
  foods!: Table<FoodItem, string>;
  incomes!: Table<Income, string>;
  recurring!: Table<RecurringExpense, string>;
  expenses!: Table<Expense, string>;
  purchases!: Table<Purchase, string>;
  stockEvents!: Table<StockEvent, string>;
  finishes!: Table<FinishEvent, string>;
  weights!: Table<WeightLog, string>;
  dinners!: Table<DinnerLog, string>;
  prices!: Table<PriceHistory, string>;
  intakes!: Table<IntakeLog, string>;

  constructor(name = 'bulk-ledger') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      foods: 'id',
      incomes: 'id',
      recurring: 'id',
      expenses: 'id, date, category',
      purchases: 'id, date',
      stockEvents: 'id, foodId, date',
      finishes: 'id, foodId',
      weights: 'date',
      dinners: 'date',
      prices: 'id, foodId',
    });
    this.version(2).stores({ intakes: 'date' });
  }
}

export const db = new AppDB();

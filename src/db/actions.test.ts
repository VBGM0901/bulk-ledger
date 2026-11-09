import { AppDB } from './db';
import { ensureDefaults } from './backup';
import { deleteExpense, logWeight, recordExpense, recordFinish, recordPurchase, setDinner } from './actions';

let db: AppDB;
beforeEach(async () => {
  db = new AppDB('a-' + Math.random());
  await ensureDefaults(db);
});

const buy = () => recordPurchase(db, {
  date: '2026-11-10',
  lines: [
    { foodId: 'yogurt', packLabel: '24개', packs: 1, qtyAdded: 24, price: 35760 },
    { foodId: 'banana', packLabel: '1송이(≈5개)', packs: 3, qtyAdded: 15, price: 8970 },
  ],
});

test('one purchase → one 식단 expense, linked purchase, stock events, price history', async () => {
  const { purchaseId, expenseId } = await buy();
  expect(await db.expenses.count()).toBe(1);
  expect(await db.expenses.get(expenseId)).toMatchObject({ amount: 44730, category: '식단', source: 'purchase', date: '2026-11-10' });
  expect((await db.purchases.get(purchaseId))!.expenseId).toBe(expenseId);
  expect(await db.stockEvents.where('foodId').equals('banana').toArray()).toEqual([
    expect.objectContaining({ type: 'purchase', qty: 15, date: '2026-11-10' }),
  ]);
  expect(await db.prices.where('foodId').equals('banana').first()).toMatchObject({ price: 2990, packLabel: '1송이(≈5개)' });
});

test('deleting a purchase expense also removes purchase and its stock', async () => {
  const { expenseId } = await buy();
  await deleteExpense(db, expenseId);
  expect(await db.expenses.count()).toBe(0);
  expect(await db.purchases.count()).toBe(0);
  expect(await db.stockEvents.count()).toBe(0);
});

test('invalid inputs are rejected without writing', async () => {
  await expect(recordPurchase(db, { date: '2026-11-10', lines: [] })).rejects.toThrow();
  await expect(recordExpense(db, { date: '2026-11-10', amount: 0, category: '여가', memo: '', source: 'manual' })).rejects.toThrow();
  await expect(recordFinish(db, { foodId: 'pb', startDate: '2026-11-10', endDate: '2026-11-01', qty: 200 })).rejects.toThrow();
  await expect(logWeight(db, '2026-11-10', 5)).rejects.toThrow('체중 값을 확인해 주세요.');
  expect(await db.expenses.count()).toBe(0);
  expect(await db.finishes.count()).toBe(0);
});

test('finish, dinner, weight upserts', async () => {
  await recordFinish(db, { foodId: 'pb', startDate: '2026-10-27', endDate: '2026-11-09', qty: 200 });
  await setDinner(db, '2026-11-10', 'meat');
  await setDinner(db, '2026-11-10', 'none');
  await logWeight(db, '2026-11-10', 70.2);
  await logWeight(db, '2026-11-10', 70.14);
  expect(await db.finishes.count()).toBe(1);
  expect((await db.dinners.get('2026-11-10'))!.choice).toBe('none');
  expect((await db.weights.get('2026-11-10'))!.kg).toBe(70.1);
});

import { AppDB } from './db';
import { ensureDefaults, exportBackup, importBackup, validateBackup } from './backup';

let db: AppDB;
beforeEach(async () => {
  db = new AppDB('t-' + Math.random());
  await ensureDefaults(db);
});

test('ensureDefaults seeds settings and 9 foods once', async () => {
  await ensureDefaults(db);
  expect(await db.foods.count()).toBe(9);
  expect((await db.settings.get('settings'))!.kcalTarget).toBe(2800);
});

test('export → import round trip, API key never exported', async () => {
  await db.incomes.put({ id: 'i', name: '월급', amount: 3_000_000 });
  await db.settings.update('settings', { apiKey: 'sk-ant-secret' });
  const file = await exportBackup(db);
  expect(JSON.stringify(file)).not.toContain('sk-ant-secret');
  const db2 = new AppDB('t2-' + Math.random());
  await importBackup(db2, JSON.parse(JSON.stringify(file)), 'replace');
  expect(await db2.incomes.get('i')).toEqual({ id: 'i', name: '월급', amount: 3_000_000 });
  expect((await db.settings.get('settings'))!.lastBackupAt).not.toBeNull();
});

test('importing keeps the existing API key when file has none', async () => {
  await db.settings.update('settings', { apiKey: 'sk-ant-keep' });
  await importBackup(db, { app: 'bulk-ledger', version: 1, data: { settings: [{ id: 'settings', kcalTarget: 3000 }] } }, 'merge');
  const s = (await db.settings.get('settings'))!;
  expect(s.apiKey).toBe('sk-ant-keep');
  expect(s.kcalTarget).toBe(3000);
  expect(s.payday).toBe(10);
});

test.each([
  ['not an object', 'hello'],
  ['wrong app', { app: 'x', version: 1, data: {} }],
  ['future version', { app: 'bulk-ledger', version: 2, data: {} }],
  ['table not array', { app: 'bulk-ledger', version: 1, data: { incomes: 'oops' } }],
  ['unknown table', { app: 'bulk-ledger', version: 1, data: { hacks: [] } }],
  ['row not object', { app: 'bulk-ledger', version: 1, data: { incomes: [1] } }],
])('invalid backup (%s) throws and leaves data untouched', async (_n, bad) => {
  await db.incomes.put({ id: 'keep', name: '월급', amount: 1 });
  expect(() => validateBackup(bad)).toThrow();
  await expect(importBackup(db, bad, 'replace')).rejects.toThrow();
  expect(await db.incomes.get('keep')).toBeTruthy();
});

test('merge mode keeps existing rows and adds new ones', async () => {
  await db.incomes.put({ id: 'a', name: 'A', amount: 1 });
  await importBackup(db, { app: 'bulk-ledger', version: 1, data: { incomes: [{ id: 'b', name: 'B', amount: 2 }] } }, 'merge');
  expect(await db.incomes.count()).toBe(2);
});

import { migrateSettings } from './backup';
import { DEFAULT_SETTINGS } from '../domain/defaults';
test('old afternoon snack with juice is migrated once; a user-edited plan is left alone', () => {
  const old = { ...DEFAULT_SETTINGS, meals: DEFAULT_SETTINGS.meals.map((m) => m.name === '오후 간식'
    ? { ...m, items: [{ foodId: 'bread', qty: 1 }, { foodId: 'pb', qty: 16 }, { foodId: 'banana', qty: 1 }, { foodId: 'juice', qty: 1 }] } : m) };
  const fixed = migrateSettings(old).meals.find((m) => m.name === '오후 간식')!;
  expect(fixed.items.some((i) => i.foodId === 'juice')).toBe(false);
  const custom = { ...DEFAULT_SETTINGS, meals: DEFAULT_SETTINGS.meals.map((m) => m.name === '오후 간식'
    ? { ...m, items: [{ foodId: 'juice', qty: 2 }] } : m) };
  expect(migrateSettings(custom).meals.find((m) => m.name === '오후 간식')!.items).toEqual([{ foodId: 'juice', qty: 2 }]);
});

test('saved plan without juice gets milk; protein target 110~120 becomes 90~110; milk food is added', async () => {
  await db.settings.put({ ...DEFAULT_SETTINGS, proteinTarget: [110, 120], meals: DEFAULT_SETTINGS.meals.map((m) => m.name === '오후 간식'
    ? { ...m, items: [{ foodId: 'bread', qty: 1 }, { foodId: 'pb', qty: 16 }, { foodId: 'banana', qty: 1 }] } : m) });
  await db.foods.delete('milk');
  await ensureDefaults(db);
  const s = (await db.settings.get('settings'))!;
  expect(s.meals.find((m) => m.name === '오후 간식')!.items.at(-1)).toEqual({ foodId: 'milk', qty: 200 });
  expect(s.proteinTarget).toEqual([90, 110]);
  expect(await db.foods.get('milk')).toBeTruthy();
});

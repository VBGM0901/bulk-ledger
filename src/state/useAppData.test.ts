import { DEFAULT_SETTINGS } from '../domain/defaults';
import { rawFixture, SAMPLE_BUDGET } from './testData';
import { deriveAppData } from './useAppData';

const raw = rawFixture({
  ...SAMPLE_BUDGET,
  finishes: [{ id: 'f', foodId: 'pb', startDate: '2026-10-27', endDate: '2026-11-09', qty: 200 }],
});

test('derives period, plan, summary and nutrition for 2026-11-10', () => {
  const d = deriveAppData(raw, '2026-11-10');
  expect(d.period).toEqual({ start: '2026-11-10', end: '2026-12-09', days: 30 });
  expect(d.plan.total).toBe(299_820);
  expect(d.summary.remaining).toBe(1_200_180);
  expect(d.dinnerToday).toBe('meat');
  expect(d.nutrition.kcal).toBe(2756);
  expect(Math.round(d.measured.pb! * 10) / 10).toBe(14.3);
  expect(d.dailyUse.pb).toBe(48);
  expect(d.backupStale).toBe(false); // 설치 직후, 기록 없음
  expect(d.needsSetup).toBe(false);
});

test('backup within 7 days is not stale; empty budget needs setup', () => {
  const d = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, lastBackupAt: '2026-11-05T00:00:00.000Z' } }), '2026-11-10');
  expect(d.backupStale).toBe(false);
  expect(d.needsSetup).toBe(true);
});

test('never backed up: warns only 7+ days after the first record', () => {
  const w = (date: string) => rawFixture({ weights: [{ date, kg: 70 }] });
  expect(deriveAppData(w('2026-11-09'), '2026-11-10').backupStale).toBe(false);
  expect(deriveAppData(w('2026-11-01'), '2026-11-10').backupStale).toBe(true);
});

test('dinner choice of the day changes nutrition', () => {
  const d = deriveAppData(rawFixture({ dinners: [{ date: '2026-11-10', choice: 'none' }] }), '2026-11-10');
  expect(d.dinnerToday).toBe('none');
  expect(d.nutrition.protein).toBe(113.6);
});

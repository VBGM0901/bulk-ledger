import { DEFAULT_FOODS, DEFAULT_SETTINGS, MILK } from '../domain/defaults';
import { TABLES, type AppDB, type TableName } from './db';
import type { Settings } from '../domain/types';

export class BackupError extends Error {}
export interface BackupFile {
  app: 'bulk-ledger';
  version: 1;
  exportedAt: string;
  data: Partial<Record<TableName, unknown[]>>;
}

/** 예전 기본 식단에서 바뀐 부분을 버전마다 한 번만 고친다. 사용자가 직접 바꾼 식단·목표는 건드리지 않는다. */
const items = (xs: [string, number][]) => xs.map(([foodId, qty]) => ({ foodId, qty }));
const AFTERNOON_JUICE = JSON.stringify(items([['bread', 1], ['pb', 16], ['banana', 1], ['juice', 1]]));
const AFTERNOON_PLAIN = items([['bread', 1], ['pb', 16], ['banana', 1]]);
const AFTERNOON_MILK = items([['bread', 1], ['pb', 16], ['banana', 1], ['milk', 200]]);
const DINNER_NUTS = JSON.stringify(items([['nuts', 30]]));
export const SETTINGS_VERSION = 2;

export function migrateSettings(s: Settings): Settings {
  let v = s.migratedV ?? 0;
  let { meals, proteinTarget } = s;
  if (v < 1) {
    // v1 (2026-11-10): 오후 과일주스 → 우유 200ml, 단백질 목표 110~120 → 90~110
    meals = meals.map((m) => {
      const cur = JSON.stringify(m.items);
      return m.name === '오후 간식' && (cur === AFTERNOON_JUICE || cur === JSON.stringify(AFTERNOON_PLAIN)) ? { ...m, items: AFTERNOON_MILK } : m;
    });
    if (proteinTarget[0] === 110 && proteinTarget[1] === 120) proteinTarget = [90, 110];
    v = 1;
  }
  if (v < 2) {
    // v2 (2026-11-10): 우유는 오후 간식이 아니라 저녁에
    const afternoon = meals.find((m) => m.name === '오후 간식');
    const dinner = meals.find((m) => m.name === '저녁');
    if (afternoon && dinner && JSON.stringify(afternoon.items) === JSON.stringify(AFTERNOON_MILK) && JSON.stringify(dinner.items) === DINNER_NUTS) {
      meals = meals.map((m) =>
        m.name === '오후 간식' ? { ...m, items: AFTERNOON_PLAIN } : m.name === '저녁' ? { ...m, items: items([['nuts', 30], ['milk', 200]]) } : m,
      );
    }
    v = 2;
  }
  return v === s.migratedV ? s : { ...s, meals, proteinTarget, migratedV: v };
}

export async function ensureDefaults(db: AppDB): Promise<void> {
  await db.transaction('rw', db.settings, db.foods, async () => {
    const s = await db.settings.get('settings');
    if (!s) await db.settings.put(DEFAULT_SETTINGS);
    else await db.settings.put(migrateSettings({ ...DEFAULT_SETTINGS, migratedV: 0, ...s })); // 새 설정 항목이 생겨도 기본값으로 채움
    if ((await db.foods.count()) === 0) await db.foods.bulkPut(DEFAULT_FOODS);
    // 식단에 우유가 들어갔는데 식품 목록에 없으면 추가
    const meals = (await db.settings.get('settings'))?.meals ?? [];
    if (meals.some((m) => m.items.some((i) => i.foodId === 'milk')) && !(await db.foods.get('milk'))) await db.foods.put(MILK);
  });
}

/** 백업 파일을 실제로 저장(공유)한 뒤에만 부른다 */
export async function markBackedUp(db: AppDB): Promise<void> {
  await db.settings.update('settings', { lastBackupAt: new Date().toISOString() });
}

/** API 키는 백업에 넣지 않는다 (파일이 공유될 수 있으므로). */
export async function exportBackup(db: AppDB): Promise<BackupFile> {
  const now = new Date().toISOString();
  const data = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  data.settings = (data.settings as { apiKey?: string }[]).map((s) => ({ ...s, apiKey: '' }));
  return { app: 'bulk-ledger', version: 1, exportedAt: now, data };
}

export function validateBackup(x: unknown): BackupFile {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new BackupError('백업 파일 형식이 아니에요.');
  const f = x as Record<string, unknown>;
  if (f.app !== 'bulk-ledger') throw new BackupError('이 앱의 백업 파일이 아니에요.');
  if (f.version !== 1) throw new BackupError(`지원하지 않는 백업 버전이에요 (${String(f.version)}).`);
  if (typeof f.data !== 'object' || f.data === null) throw new BackupError('백업 데이터가 비어 있어요.');
  for (const [k, v] of Object.entries(f.data as Record<string, unknown>)) {
    if (!(TABLES as readonly string[]).includes(k)) throw new BackupError(`알 수 없는 항목이 있어요: ${k}`);
    if (!Array.isArray(v)) throw new BackupError(`${k} 항목이 목록이 아니에요.`);
    if (v.some((row) => typeof row !== 'object' || row === null)) throw new BackupError(`${k} 항목에 잘못된 값이 있어요.`);
  }
  return f as unknown as BackupFile;
}

/**
 * replace: 파일에 있는 표는 지우고 교체. merge: 같은 id는 덮어쓰고 나머지는 유지.
 * 어느 쪽이든 settings의 apiKey가 비어 있으면 기존 키를 유지한다.
 */
export async function importBackup(db: AppDB, x: unknown, mode: 'replace' | 'merge'): Promise<void> {
  const file = validateBackup(x);
  const currentKey = (await db.settings.get('settings'))?.apiKey ?? '';
  const tables = TABLES.map((t) => db.table(t));
  await db.transaction('rw', tables, async () => {
    for (const t of TABLES) {
      let rows = file.data[t];
      if (!rows) {
        // 교체: 파일에 없는 표(예: 예전 백업에는 없던 식사 기록·대화)도 비운다. 설정·식품은 기본값을 남긴다
        if (mode === 'replace' && t !== 'settings' && t !== 'foods') await db.table(t).clear();
        continue;
      }
      if (t === 'settings') {
        const existing = await db.settings.get('settings');
        rows = (rows as Record<string, unknown>[]).map((r) => ({
          ...(existing ?? {}),
          ...r,
          id: 'settings',
          apiKey: (r.apiKey as string) || currentKey,
        }));
      }
      if (mode === 'replace') await db.table(t).clear();
      await db.table(t).bulkPut(rows);
    }
  });
  await ensureDefaults(db);
}

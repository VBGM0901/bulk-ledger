import { DEFAULT_FOODS, DEFAULT_SETTINGS } from '../domain/defaults';
import { TABLES, type AppDB, type TableName } from './db';

export class BackupError extends Error {}
export interface BackupFile {
  app: 'bulk-ledger';
  version: 1;
  exportedAt: string;
  data: Partial<Record<TableName, unknown[]>>;
}

export async function ensureDefaults(db: AppDB): Promise<void> {
  await db.transaction('rw', db.settings, db.foods, async () => {
    const s = await db.settings.get('settings');
    if (!s) await db.settings.put(DEFAULT_SETTINGS);
    else await db.settings.put({ ...DEFAULT_SETTINGS, ...s }); // 새 설정 항목이 생겨도 기본값으로 채움
    if ((await db.foods.count()) === 0) await db.foods.bulkPut(DEFAULT_FOODS);
  });
}

/** API 키는 백업에 넣지 않는다 (파일이 공유될 수 있으므로). */
export async function exportBackup(db: AppDB): Promise<BackupFile> {
  const now = new Date().toISOString();
  await db.settings.update('settings', { lastBackupAt: now });
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
      if (!rows) continue;
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

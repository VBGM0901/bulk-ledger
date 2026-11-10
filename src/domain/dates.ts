import type { ISODate } from './types';

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;

export function toUTC(d: ISODate): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function fromUTC(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}
export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY);
}
/** b − a in days (same day → 0). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}
export function daysInclusive(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) + 1;
}
export function todayISO(now: Date = new Date()): ISODate {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export interface Period { start: ISODate; end: ISODate; days: number }

/** Budget month: payday of this month … day before next payday. */
export function budgetPeriod(date: ISODate, payday = 10): Period {
  if (!Number.isInteger(payday) || payday < 1 || payday > 28) throw new Error('payday must be 1..28');
  const [y, m, d] = date.split('-').map(Number);
  let sy = y;
  let sm = m;
  if (d < payday) {
    sm = m === 1 ? 12 : m - 1;
    sy = m === 1 ? y - 1 : y;
  }
  const ny = sm === 12 ? sy + 1 : sy;
  const nm = sm === 12 ? 1 : sm + 1;
  const start = iso(sy, sm, payday);
  const end = addDays(iso(ny, nm, payday), -1);
  return { start, end, days: daysInclusive(start, end) };
}

/** 요일 (0=일요일) */
export const dow = (d: ISODate) => new Date(`${d}T00:00:00`).getDay();
/** 그 달 1일 */
export const monthStart = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;
/** 1일 기준으로 n달 이동 */
export function shiftMonth(first: ISODate, n: number): ISODate {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}
/** 그 달의 모든 날짜 */
export function monthDays(first: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
}

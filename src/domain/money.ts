export function formatKRW(n: number | null): string {
  if (n === null) return '미입력';
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}
export function formatNum(n: number | null, digits = 0): string {
  if (n === null) return '미입력';
  return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** "12,500원" / "12500" → 12500. Empty → null. */
export function parseAmount(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

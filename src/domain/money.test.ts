import { formatKRW, formatNum, parseAmount } from './money';

test('formatKRW', () => {
  expect(formatKRW(283620)).toBe('283,620원');
  expect(formatKRW(-1500)).toBe('-1,500원');
  expect(formatKRW(null)).toBe('미입력');
});
test('formatNum', () => {
  expect(formatNum(14.2857, 1)).toBe('14.3');
  expect(formatNum(2746)).toBe('2,746');
  expect(formatNum(null)).toBe('미입력');
});
test('parseAmount', () => {
  expect(parseAmount('12,500원')).toBe(12500);
  expect(parseAmount('  ')).toBeNull();
});

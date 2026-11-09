import { addDays, budgetPeriod, daysBetween, daysInclusive, todayISO } from './dates';

describe('dates', () => {
  test('addDays crosses month/year', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-10', -1)).toBe('2026-11-09');
  });
  test('daysInclusive / daysBetween', () => {
    expect(daysInclusive('2026-10-27', '2026-11-09')).toBe(14);
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(0);
    expect(daysBetween('2026-11-09', '2026-11-12')).toBe(3);
  });
  test('todayISO uses local date parts', () => {
    expect(todayISO(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09');
  });
});

describe('budgetPeriod (payday 10)', () => {
  test('on payday starts a new period', () => {
    expect(budgetPeriod('2026-11-10')).toEqual({ start: '2026-11-10', end: '2026-12-09', days: 30 });
  });
  test('day before payday belongs to previous period', () => {
    expect(budgetPeriod('2026-11-09')).toEqual({ start: '2026-10-10', end: '2026-11-09', days: 31 });
  });
  test('January 9 wraps to previous December', () => {
    expect(budgetPeriod('2027-01-09')).toEqual({ start: '2026-12-10', end: '2027-01-09', days: 31 });
  });
  test('February period has 28 days', () => {
    expect(budgetPeriod('2027-02-15')).toEqual({ start: '2027-02-10', end: '2027-03-09', days: 28 });
  });
  test('rejects payday outside 1..28', () => {
    expect(() => budgetPeriod('2026-11-10', 31)).toThrow();
  });
});

import { cheapestPacks } from './optimizer';

const yogurt = [{ label: '12개', qty: 12, price: 19080 }, { label: '24개', qty: 24, price: 35760 }];
const bread = [{ label: '1봉', qty: 10, price: 2610 }, { label: '3봉', qty: 30, price: 7590 }, { label: '5봉', qty: 50, price: 12400 }];
const pb = [{ label: '200g', qty: 200, price: 3900 }, { label: '510g', qty: 510, price: 7500 }];

test('yogurt 30 → 24+12', () => {
  const r = cheapestPacks(30, yogurt)!;
  expect(r.cost).toBe(54840);
  expect(r.qty).toBe(36);
});
test('bread 90 slices → 5봉+3봉+1봉', () => {
  expect(cheapestPacks(90, bread)!.cost).toBe(22600);
});
test('peanut butter 1440g → 510g×3', () => {
  const r = cheapestPacks(1440, pb)!;
  expect(r.cost).toBe(22500);
  expect(r.choices).toEqual([{ option: pb[1], count: 3 }]);
});
test('needed <= 0 buys nothing', () => {
  expect(cheapestPacks(0, yogurt)).toEqual({ choices: [], cost: 0, qty: 0 });
  expect(cheapestPacks(-5, yogurt)).toEqual({ choices: [], cost: 0, qty: 0 });
});
test('no options → null, zero-qty options ignored (no infinite loop)', () => {
  expect(cheapestPacks(10, [])).toBeNull();
  expect(cheapestPacks(10, [{ label: 'bad', qty: 0, price: 100 }])).toBeNull();
});
test('fractional need rounds up to whole units', () => {
  expect(cheapestPacks(10.2, [{ label: '1', qty: 1, price: 10 }])!.cost).toBe(110);
});

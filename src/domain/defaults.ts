import type { FoodItem, Meal, Settings } from './types';

// 개인 금액은 여기 넣지 않는다 — 공개 저장소. personal/seed.json으로만 불러온다.
const label = { kcal: 'label', protein: 'label' } as const;
const est = { kcal: 'estimate', protein: 'estimate' } as const;
const kcalOnly = { kcal: 'label', protein: 'estimate' } as const;
const checked = '2026-11-09';

export const DEFAULT_FOODS: FoodItem[] = [
  {
    id: 'rice', name: '미트리 자이언트 닭가슴살 볶음밥 3종', unit: '개',
    perUnit: { kcal: 488, protein: 30 }, nutritionSource: label,
    packOptions: [{ label: '12개', qty: 12, price: 40500 }, { label: '18개', qty: 18, price: 59600 }, { label: '30개', qty: 30, price: 96900 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'sellerFree',
  },
  {
    id: 'egg', name: '곰곰 맥반석 구운란', unit: '개',
    perUnit: { kcal: 72, protein: 6.5 }, nutritionSource: est,
    url: 'https://www.coupang.com/vp/products/1354181605?vendorItemId=70378249265',
    packOptions: [{ label: '30구', qty: 30, price: 9980 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'rocketFresh',
  },
  {
    id: 'banana', name: '스텔라나 베트남산 바나나', unit: '개',
    perUnit: { kcal: 105, protein: 1.3 }, nutritionSource: est,
    url: 'https://www.coupang.com/vp/products/7312490308?vendorItemId=85939009961',
    packOptions: [{ label: '1송이(≈5개)', qty: 5, price: 2990 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'rocketFresh',
  },
  {
    id: 'yogurt', name: '매일바이오 그릭요거트 무가당 플레인 150g', unit: '개',
    perUnit: { kcal: 135, protein: 10 }, nutritionSource: label,
    url: 'https://www.coupang.com/vp/products/9281513889?vendorItemId=94444935650',
    packOptions: [{ label: '12개', qty: 12, price: 19080 }, { label: '24개', qty: 24, price: 35760 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'rocketFresh',
  },
  {
    id: 'bread', name: '곰곰 우유 가득 식빵 350g', unit: '조각',
    perUnit: { kcal: 97, protein: 3 }, nutritionSource: kcalOnly,
    url: 'https://www.coupang.com/vp/products/6942954519?vendorItemId=84021335614',
    packOptions: [{ label: '1봉', qty: 10, price: 2610 }, { label: '3봉', qty: 30, price: 7590 }, { label: '5봉', qty: 50, price: 12400 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'rocketFresh',
  },
  {
    id: 'pb', name: '피넛몬스터 100% 땅콩버터 스무스', unit: 'g',
    perUnit: { kcal: 6, protein: 0.25 }, nutritionSource: est,
    url: 'https://www.coupang.com/vp/products/9512138186?vendorItemId=95298875427',
    packOptions: [{ label: '200g', qty: 200, price: 3900 }, { label: '510g', qty: 510, price: 7500 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'sellerRocket',
  },
  {
    id: 'nuts', name: '해맑음푸드 너트타임 그린 믹스넛 1kg', unit: 'g',
    perUnit: { kcal: 5.2, protein: 0.17 }, nutritionSource: kcalOnly,
    url: 'https://www.coupang.com/vp/products/4868287?itemId=22180469&vendorItemId=3032427712',
    packOptions: [{ label: '1kg', qty: 1000, price: 10980 }],
    free: false, priceCheckedAt: checked, priceSource: 'user', shippingGroup: 'rocket',
  },
  {
    id: 'juice', name: '과일주스(집)', unit: '잔',
    perUnit: { kcal: 120, protein: 0.5 }, nutritionSource: est,
    packOptions: [], free: true, priceCheckedAt: null, priceSource: 'unverified', shippingGroup: 'none',
  },
];

export const DEFAULT_MEALS: Meal[] = [
  { name: '아침', items: [{ foodId: 'juice', qty: 1 }, { foodId: 'yogurt', qty: 1 }, { foodId: 'egg', qty: 2 }] },
  { name: '오전 간식', items: [{ foodId: 'bread', qty: 2 }, { foodId: 'pb', qty: 32 }, { foodId: 'banana', qty: 1 }] },
  { name: '점심', items: [{ foodId: 'rice', qty: 1 }, { foodId: 'egg', qty: 2 }] },
  { name: '오후 간식', items: [{ foodId: 'bread', qty: 1 }, { foodId: 'pb', qty: 16 }, { foodId: 'banana', qty: 1 }] }, // 과일주스는 오후에 못 먹음 (2026-11-10)
  { name: '저녁', items: [{ foodId: 'nuts', qty: 30 }] },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  payday: 10,
  kcalTarget: 2800,
  proteinTarget: [110, 120],
  weightGoal: null,
  logScope: 'food',
  apiKey: '',
  lastBackupAt: null,
  theme: 'system',
  dinner: { meat: { kcal: 650, protein: 30 }, none: { kcal: 650, protein: 12 }, less: { kcal: 400, protein: 10 } },
  meals: DEFAULT_MEALS,
  profileNote: '',
};

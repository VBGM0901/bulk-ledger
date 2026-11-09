import { EXPENSE_CATEGORIES, type ExpenseCategory, type FoodItem, type ISODate, type PurchaseLine } from '../domain/types';
import { callClaude, ClaudeError, MODELS } from './client';

export interface CaptureItem { name: string; foodId: string | null; packLabel: string | null; packs: number; price: number }
export interface CaptureResult {
  kind: 'coupang_order' | 'receipt' | 'card_alert' | 'other';
  date: ISODate | null;
  merchant: string | null;
  total: number | null;
  category: ExpenseCategory;
  items: CaptureItem[];
}

export function buildCapturePrompt(foods: FoodItem[], today: ISODate): string {
  const catalog = foods
    .filter((f) => !f.free)
    .map((f) => `- id=${f.id} | ${f.name} | 포장: ${f.packOptions.map((o) => `"${o.label}"`).join(', ')}`)
    .join('\n');
  return [
    '너는 한국어 가계부 앱의 결제 캡처 판독기다. 이미지(쿠팡 주문내역, 영수증, 카드 결제 알림 등)에서 결제 정보를 읽어 JSON 객체 하나만 출력한다. 다른 말은 쓰지 않는다.',
    `오늘은 ${today}이다. 날짜에 연도가 없으면 오늘 기준으로 가장 가까운 과거 날짜로 채운다. 날짜를 알 수 없으면 null.`,
    '스키마:',
    `{"kind":"coupang_order|receipt|card_alert|other","date":"YYYY-MM-DD|null","merchant":"가게/판매처|null","total":결제총액(정수 원)|null,"category":"${EXPENSE_CATEGORIES.join('|')}","items":[{"name":"상품명","foodId":"아래 id|null","packLabel":"아래 포장 이름 그대로|null","packs":수량(정수),"price":그 줄 결제 금액(정수 원)}]}`,
    '규칙:',
    '- 아래 식단 목록과 같은 상품이면 foodId와 packLabel을 채운다. 포장 크기가 목록에 없거나 확실하지 않으면 둘 다 null.',
    '- 식단 품목이 하나라도 있으면 category는 "식단". 아니면 내용에 맞는 카테고리(저녁 외식/배달은 "저녁식비").',
    '- 금액은 할인 적용 후 실제로 낸 금액. 취소/환불된 줄은 제외.',
    '- 카드 알림처럼 품목이 없으면 items는 [{"name":가맹점,"foodId":null,"packLabel":null,"packs":1,"price":총액}].',
    '식단 목록:',
    catalog,
  ].join('\n');
}

function extractJSON(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ClaudeError('bad_response');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ClaudeError('bad_response');
  }
}
const int = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
const KINDS = ['coupang_order', 'receipt', 'card_alert', 'other'] as const;

/** Claude 응답을 검증한다. 목록에 없는 foodId/포장은 신뢰하지 않고 null로 바꾼다. */
export function parseCaptureResponse(text: string, foods: FoodItem[]): CaptureResult {
  const raw = extractJSON(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ClaudeError('bad_response');
  const r = raw as Record<string, unknown>;
  const byId = new Map(foods.map((f) => [f.id, f]));
  const rawItems = Array.isArray(r.items) ? (r.items as unknown[]) : [];
  const items: CaptureItem[] = rawItems
    .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
    .map((it) => {
      const food = byId.get(String(it.foodId));
      const pack = food?.packOptions.find((o) => o.label === it.packLabel);
      const ok = Boolean(food && pack && !food.free);
      return {
        name: str(it.name) ?? '이름 없음',
        foodId: ok ? food!.id : null,
        packLabel: ok ? pack!.label : null,
        packs: Math.max(1, int(it.packs) ?? 1),
        price: Math.max(0, int(it.price) ?? 0),
      };
    });
  const date = str(r.date);
  return {
    kind: (KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as CaptureResult['kind']) : 'other',
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    merchant: str(r.merchant),
    total: int(r.total),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as ExpenseCategory) : '기타',
    items,
  };
}

export async function readCapture(
  apiKey: string,
  image: { mediaType: string; base64: string },
  foods: FoodItem[],
  today: ISODate,
  fetchImpl?: typeof fetch,
): Promise<CaptureResult> {
  const text = await callClaude({
    apiKey,
    model: MODELS.capture,
    system: buildCapturePrompt(foods, today),
    fetchImpl,
    maxTokens: 1500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: '이 캡처를 스키마대로 JSON으로 읽어줘.' },
      ],
    }],
  });
  return parseCaptureResponse(text, foods);
}

export function toPurchaseLines(items: CaptureItem[], foods: FoodItem[]): PurchaseLine[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  return items.flatMap((it) => {
    const pack = it.foodId ? byId.get(it.foodId)?.packOptions.find((o) => o.label === it.packLabel) : undefined;
    return it.foodId && pack && it.price > 0
      ? [{ foodId: it.foodId, packLabel: pack.label, packs: it.packs, qtyAdded: it.packs * pack.qty, price: it.price }]
      : [];
  });
}

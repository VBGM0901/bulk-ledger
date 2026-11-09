import { DEFAULT_FOODS } from '../domain/defaults';
import { buildCapturePrompt, parseCaptureResponse, readCapture, toPurchaseLines } from './capture';

const good = {
  kind: 'coupang_order', date: '2026-11-10', merchant: '쿠팡', total: 38750, category: '식단',
  items: [
    { name: '매일바이오 그릭요거트 24개', foodId: 'yogurt', packLabel: '24개', packs: 1, price: 35760 },
    { name: '바나나', foodId: 'banana', packLabel: '1송이(≈5개)', packs: 1, price: 2990 },
  ],
};

test('prompt lists catalog ids and pack labels, not free foods', () => {
  const p = buildCapturePrompt(DEFAULT_FOODS, '2026-11-10');
  expect(p).toContain('id=yogurt');
  expect(p).toContain('"510g"');
  expect(p).not.toContain('id=juice');
});

test('parses JSON wrapped in prose or code fences', () => {
  const r = parseCaptureResponse('여기요:\n```json\n' + JSON.stringify(good) + '\n```', DEFAULT_FOODS);
  expect(r.items).toHaveLength(2);
  expect(r.total).toBe(38750);
  expect(r.date).toBe('2026-11-10');
});

test('unknown foodId or packLabel is cleared to null, not trusted', () => {
  const r = parseCaptureResponse(
    JSON.stringify({ ...good, items: [{ name: 'x', foodId: 'ghost', packLabel: '99개', packs: 1, price: 100 }, { name: 'y', foodId: 'yogurt', packLabel: '99개', packs: 1, price: 1 }] }),
    DEFAULT_FOODS,
  );
  expect(r.items[0]).toMatchObject({ foodId: null, packLabel: null });
  expect(r.items[1]).toMatchObject({ foodId: null, packLabel: null });
});

test('invalid category → 기타, bad date → null, non-JSON throws bad_response', () => {
  const r = parseCaptureResponse(JSON.stringify({ ...good, category: '해킹', date: '11월 10일' }), DEFAULT_FOODS);
  expect(r.category).toBe('기타');
  expect(r.date).toBeNull();
  expect(() => parseCaptureResponse('죄송해요 못 읽겠어요', DEFAULT_FOODS)).toThrow(expect.objectContaining({ kind: 'bad_response' }));
  expect(() => parseCaptureResponse('{broken', DEFAULT_FOODS)).toThrow();
});

test('toPurchaseLines maps matched items to pack quantities', () => {
  const lines = toPurchaseLines(parseCaptureResponse(JSON.stringify(good), DEFAULT_FOODS).items, DEFAULT_FOODS);
  expect(lines).toEqual([
    { foodId: 'yogurt', packLabel: '24개', packs: 1, qtyAdded: 24, price: 35760 },
    { foodId: 'banana', packLabel: '1송이(≈5개)', packs: 1, qtyAdded: 5, price: 2990 },
  ]);
});

test('readCapture sends image block to haiku', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(good) }] }), { status: 200 }));
  await readCapture('k', { mediaType: 'image/png', base64: 'AAA' }, DEFAULT_FOODS, '2026-11-10', f);
  const body = JSON.parse(f.mock.calls[0][1].body);
  expect(body.model).toBe('claude-haiku-5-5');
  expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
});

import { ensureDefaults } from '../db/backup';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { rawFixture } from '../state/testData';
import { deriveAppData } from '../state/useAppData';
import { buildTools, runChatTurn, runTool, undoAction } from './agent';

const TODAY = '2026-11-10';
const data = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, apiKey: 'sk-test' } }), TODAY);
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureDefaults(db);
});

test('tools are strict, closed schemas with every property required', () => {
  for (const t of buildTools(data)) {
    expect(t.strict).toBe(true);
    const s = t.input_schema as { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    expect(s.additionalProperties).toBe(false);
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
  }
});

test('"아침에 요거트만 먹었어" → only yogurt counted, undo restores', async () => {
  const a = await runTool(db, data, 'record_eaten', { date: TODAY, meal: '아침', foods: [{ foodId: 'yogurt', qty: 1 }], home: 0 });
  expect((await db.intakes.get(TODAY))?.items?.['아침']).toEqual({ juice: 0, yogurt: 1, egg: 0 });
  expect(a.summary).toContain('그릭요거트');
  await undoAction(db, a);
  expect(await db.intakes.get(TODAY)).toBeUndefined();
});

test('expense, purchase, weight, extra food and their undo', async () => {
  const e = await runTool(db, data, 'record_expense', { date: TODAY, amount: 1500, category: '추가식품', memo: '삼각김밥' });
  expect(await db.expenses.count()).toBe(1);
  await undoAction(db, e);
  expect(await db.expenses.count()).toBe(0);

  const p = await runTool(db, data, 'record_food_purchase', { date: TODAY, items: [{ foodId: 'banana', packLabel: data.foods.find((f) => f.id === 'banana')!.packOptions[0].label, packs: 2 }] });
  expect(await db.purchases.count()).toBe(1);
  await undoAction(db, p);
  expect(await db.purchases.count()).toBe(0);

  await db.weights.put({ date: TODAY, kg: 54 });
  const w = await runTool(db, data, 'log_weight', { date: TODAY, kg: 54.36 });
  expect((await db.weights.get(TODAY))?.kg).toBe(54.4);
  await undoAction(db, w);
  expect((await db.weights.get(TODAY))?.kg).toBe(54);

  await runTool(db, data, 'record_extra_food', { date: TODAY, name: '라면', kcal: 500, protein: 10 });
  expect((await db.intakes.get(TODAY))?.extras?.[0]).toMatchObject({ name: '라면', kcal: 500 });
});

test('bad input is rejected with a Korean message (future date, unknown pack)', async () => {
  await expect(runTool(db, data, 'log_weight', { date: '2026-11-11', kg: 54 })).rejects.toThrow('미래 날짜');
  await expect(runTool(db, data, 'record_food_purchase', { date: TODAY, items: [{ foodId: 'banana', packLabel: '없는 포장', packs: 1 }] })).rejects.toThrow('포장 이름');
});

test('runChatTurn: runs tool calls, returns tool results, keeps thinking blocks, ends with text', async () => {
  const f = vi.fn()
    .mockResolvedValueOnce(reply({
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'tool_use', id: 't1', name: 'mark_meals_all_eaten', input: { date: TODAY, meals: ['아침', '점심'] } },
        { type: 'tool_use', id: 't2', name: 'log_weight', input: { date: '2099-01-01', kg: 54 } },
      ],
    }))
    .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: '아침·점심 기록했어요.' }] }));
  const out = await runChatTurn(db, () => data, [{ role: 'user', content: '아침 점심 다 먹었어' }], f);
  expect(out.text).toBe('아침·점심 기록했어요.');
  expect(out.actions).toHaveLength(1);
  expect(out.errors[0]).toContain('미래 날짜');
  expect((await db.intakes.get(TODAY))?.meals).toEqual({ 아침: 'all', 점심: 'all' });

  const second = JSON.parse(f.mock.calls[1][1].body);
  expect(second.messages[1].content[0]).toEqual({ type: 'thinking', thinking: '', signature: 'sig' }); // 그대로 이어 붙임
  const results = second.messages[2].content;
  expect(results).toEqual([
    expect.objectContaining({ type: 'tool_result', tool_use_id: 't1' }),
    expect.objectContaining({ type: 'tool_result', tool_use_id: 't2', is_error: true }),
  ]);
  const first = JSON.parse(f.mock.calls[0][1].body);
  expect(first.model).toBe('claude-sonnet-5-5');
  expect(first.tool_choice).toBeUndefined();
  expect(first.fallbacks).toBe('default');
  expect(f.mock.calls[0][1].headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
});

test('if the fallback option is rejected (400), it retries once without it', async () => {
  const f = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'fallbacks: unsupported' } }), { status: 400 }))
    .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: '네' }] }));
  const out = await runChatTurn(db, () => data, [{ role: 'user', content: '안녕' }], f);
  expect(out.text).toBe('네');
  expect(JSON.parse(f.mock.calls[1][1].body).fallbacks).toBeUndefined();
});

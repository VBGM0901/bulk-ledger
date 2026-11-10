import { DEFAULT_SETTINGS } from '../domain/defaults';
import { rawFixture, SAMPLE_BUDGET } from '../state/testData';
import { deriveAppData } from '../state/useAppData';
import { askClaude, buildChatContext } from './chat';

const data = deriveAppData(
  rawFixture({ ...SAMPLE_BUDGET, settings: { ...DEFAULT_SETTINGS, apiKey: 'sk-ant-secret' }, weights: [{ date: '2026-11-10', kg: 70.1 }] }),
  '2026-11-10',
);

test('context has budget, nutrition, cost efficiency, never the API key', () => {
  const c = buildChatContext(data);
  expect(c).toContain('남은 예산 1,200,180원');
  expect(c).toContain('오늘 계획 2,756kcal');
  expect(c).toContain('원/kcal');
  expect(c).toContain('70.1kg');
  expect(c).not.toContain('sk-ant-secret');
  expect(c).not.toContain('사용자 메모');
});

test('profile note from settings is included when present', () => {
  const d = deriveAppData(rawFixture({ settings: { ...DEFAULT_SETTINGS, profileNote: '웨이트 주 4회' } }), '2026-11-10');
  expect(buildChatContext(d)).toContain('사용자 메모: 웨이트 주 4회');
});

test('askClaude uses sonnet, sends history, system holds context', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '답' }] }), { status: 200 }));
  expect(await askClaude(data, [{ role: 'user', content: '얼마 남았어?' }], f)).toBe('답');
  const body = JSON.parse(f.mock.calls[0][1].body);
  expect(body.model).toBe('claude-sonnet-5-5');
  expect(body.messages).toEqual([{ role: 'user', content: '얼마 남았어?' }]);
  expect(body.system).toContain('남은 예산');
  expect(body.system).not.toContain('sk-ant-secret');
});

test('context includes recent intake and weight records', () => {
  const d = deriveAppData(rawFixture({
    weights: [{ date: '2026-11-09', kg: 70.2 }],
    intakes: [{ date: '2026-11-09', meals: { 아침: 'all' }, extras: [{ id: 'x', name: '삼각김밥', kcal: 200, protein: 5 }] }],
  }), '2026-11-10');
  const c = buildChatContext(d);
  expect(c).toContain('- 2026-11-09: 599kcal');
  expect(c).toContain('체중 70.2kg');
  expect(c).toContain('추가: 삼각김밥 200kcal');
});

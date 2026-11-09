import { callClaude, ClaudeError } from './client';

const ok = (text: string) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 }));

test('sends required headers and returns text', async () => {
  const f = ok('안녕');
  const out = await callClaude({ apiKey: 'k', model: 'claude-haiku-5-5', system: 's', messages: [{ role: 'user', content: 'hi' }], fetchImpl: f });
  expect(out).toBe('안녕');
  const [url, init] = f.mock.calls[0];
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect(init.headers).toMatchObject({
    'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
  });
  expect(JSON.parse(init.body)).toMatchObject({ model: 'claude-haiku-5-5', system: 's', max_tokens: 1024 });
});

test.each([
  ['', () => new Response('{}', { status: 200 }), 'no_key'],
  ['k', () => new Response('{}', { status: 401 }), 'auth'],
  ['k', () => new Response('{}', { status: 429 }), 'rate'],
  ['k', () => new Response('{"content":[]}', { status: 200 }), 'bad_response'],
  ['k', () => new Response('not json', { status: 200 }), 'bad_response'],
  ['k', () => new Response('{}', { status: 500 }), 'bad_response'],
])('errors map to kinds (key=%s → %s)', async (key, res, kind) => {
  const f = vi.fn().mockImplementation(async () => res());
  await expect(callClaude({ apiKey: key, model: 'm', system: '', messages: [{ role: 'user', content: 'x' }], fetchImpl: f }))
    .rejects.toMatchObject({ kind });
});

test('network failure → network kind with Korean message', async () => {
  const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  const p = callClaude({ apiKey: 'k', model: 'm', system: '', messages: [{ role: 'user', content: 'x' }], fetchImpl: f });
  await expect(p).rejects.toBeInstanceOf(ClaudeError);
  await expect(p).rejects.toThrow('인터넷 연결을 확인해 주세요.');
});

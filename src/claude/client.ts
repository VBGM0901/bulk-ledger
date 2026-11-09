export type ClaudeErrorKind = 'no_key' | 'auth' | 'rate' | 'network' | 'bad_response';

const MESSAGES: Record<ClaudeErrorKind, string> = {
  no_key: '설정에서 Claude API 키를 먼저 입력해 주세요.',
  auth: 'API 키가 올바르지 않아요. 설정에서 다시 확인해 주세요.',
  rate: '요청이 많거나 이번 달 크레딧/한도를 다 썼어요. 잠시 뒤 다시 시도해 주세요.',
  network: '인터넷 연결을 확인해 주세요.',
  bad_response: 'Claude 답을 이해하지 못했어요. 다시 시도하거나 직접 입력해 주세요.',
};

export class ClaudeError extends Error {
  readonly kind: ClaudeErrorKind;
  constructor(kind: ClaudeErrorKind, detail?: string) {
    super(MESSAGES[kind] + (detail ? ` (${detail})` : ''));
    this.kind = kind;
  }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ChatMessage { role: 'user' | 'assistant'; content: string | ContentBlock[] }

export const MODELS = { capture: 'claude-haiku-5-5', chat: 'claude-sonnet-5-5' } as const;

export async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  if (!opts.apiKey) throw new ClaudeError('no_key');
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: opts.model, system: opts.system, messages: opts.messages, max_tokens: opts.maxTokens ?? 1024 }),
    });
  } catch {
    throw new ClaudeError('network');
  }
  if (res.status === 401 || res.status === 403) throw new ClaudeError('auth');
  if (res.status === 429 || res.status === 529) throw new ClaudeError('rate');
  if (!res.ok) throw new ClaudeError('bad_response', `HTTP ${res.status}`);
  let body: { content?: { type: string; text?: string }[] };
  try {
    body = await res.json();
  } catch {
    throw new ClaudeError('bad_response');
  }
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (!text) throw new ClaudeError('bad_response');
  return text;
}

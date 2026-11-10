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

/** ping: 키 연결 확인용(가장 싼 모델), chat: 대화방 */
export const MODELS = { ping: 'claude-haiku-5-5', chat: 'claude-sonnet-5-5' } as const;

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

/** 도구 사용 루프용: 응답 본문 전체(content 블록·stop_reason)를 돌려준다. */
export type ApiBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };
export interface ApiMessage { role: 'user' | 'assistant'; content: string | ApiBlock[] | ContentBlock[] | Record<string, unknown>[] }
export interface ApiTool { name: string; description: string; strict?: boolean; input_schema: Record<string, unknown> }
export interface ApiResponse { content: ApiBlock[]; stop_reason: string | null }

export async function callClaudeRaw(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ApiMessage[];
  tools?: ApiTool[];
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /** 안전 거절 시 서버가 다른 모델로 자동 재시도 (Claude API 베타). 거부되면 끄고 한 번 더 보낸다. */
  fallbacks?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ApiResponse> {
  if (!opts.apiKey) throw new ClaudeError('no_key');
  if (opts.fallbacks) {
    try {
      return await callClaudeRaw({ ...opts, fallbacks: false, withFallbackHeader: true } as Parameters<typeof callClaudeRaw>[0]);
    } catch (e) {
      if (e instanceof ClaudeError && e.kind === 'bad_response' && /HTTP 400/.test(e.message)) {
        return callClaudeRaw({ ...opts, fallbacks: false });
      }
      throw e;
    }
  }
  const withFallback = Boolean((opts as { withFallbackHeader?: boolean }).withFallbackHeader);
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
        ...(withFallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
      },
      body: JSON.stringify({
        ...(withFallback ? { fallbacks: 'default' } : {}),
        model: opts.model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        max_tokens: opts.maxTokens ?? 16000,
        ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
      }),
    });
  } catch {
    throw new ClaudeError('network');
  }
  if (res.status === 401 || res.status === 403) throw new ClaudeError('auth');
  if (res.status === 429 || res.status === 529) throw new ClaudeError('rate');
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error?.message) detail += ` ${String(j.error.message).slice(0, 120)}`;
    } catch { /* ignore */ }
    throw new ClaudeError('bad_response', detail);
  }
  try {
    const body = await res.json();
    if (!Array.isArray(body.content)) throw new Error();
    return { content: body.content, stop_reason: body.stop_reason ?? null };
  } catch {
    throw new ClaudeError('bad_response');
  }
}

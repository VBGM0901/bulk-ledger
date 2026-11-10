import { updateSettings } from '../db/actions';
import type { AppDB } from '../db/db';
import { callClaude, ClaudeError, MODELS } from './client';

export interface KeyResult { tone: 'ok' | 'warn' | 'err'; text: string }

/**
 * API 키 저장 (대화방·설정 공통). 먼저 그 키로 연결을 확인하고, 되면 저장한다.
 * 키가 틀렸으면 저장하지 않고, 인터넷·한도 문제처럼 키 탓이 아닐 수 있으면 저장은 해 둔다.
 */
export async function saveApiKey(db: AppDB, raw: string, fetchImpl?: typeof fetch): Promise<KeyResult> {
  const k = raw.trim();
  if (!k.startsWith('sk-ant-')) {
    return { tone: 'err', text: 'API 키는 sk-ant- 로 시작해요. Console에서 복사한 키 전체를 붙여넣어 주세요.' };
  }
  try {
    await callClaude({ apiKey: k, model: MODELS.ping, system: '한 단어로 답해.', messages: [{ role: 'user', content: '연결 확인' }], maxTokens: 10, fetchImpl });
    await updateSettings(db, { apiKey: k });
    return { tone: 'ok', text: '연결됐어요. 키를 저장했어요.' };
  } catch (e) {
    if (e instanceof ClaudeError && e.kind === 'auth') {
      return { tone: 'err', text: '이 키로는 연결이 안 돼요. 키를 다시 복사했는지, Console에서 삭제·만료되지 않았는지 확인해 주세요.' };
    }
    await updateSettings(db, { apiKey: k });
    return { tone: 'warn', text: `키는 저장했지만 연결 확인은 못 했어요: ${(e as Error).message}` };
  }
}

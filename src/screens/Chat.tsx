import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Screen } from '../App';
import { askClaude } from '../claude/chat';
import { newId } from '../db/actions';
import { db } from '../db/db';
import type { ChatMessage } from '../domain/types';
import type { AppData } from '../state/useAppData';

const SUGGEST = [
  '이번 주 내 식사 기록 어때?',
  '체중이 잘 늘고 있어? 뭘 더 먹을까?',
  '단백질을 제일 싸게 더 채우려면?',
  '이번 달 얼마 남았어?',
];
/** API에 보내는 최근 메시지 수 (비용·속도 조절) */
const HISTORY = 20;

const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Chat({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const msgs = useLiveQuery(() => db.chats.orderBy('at').toArray(), []) ?? [];
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hasKey = Boolean(data.settings.apiKey);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [msgs.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const userMsg: ChatMessage = { id: newId(), at: new Date().toISOString(), role: 'user', content: q };
    await db.chats.put(userMsg);
    setInput('');
    setBusy(true);
    setErr(null);
    try {
      const history = [...msgs, userMsg].slice(-HISTORY).map(({ role, content }) => ({ role, content }));
      // API는 user로 시작해야 한다
      while (history.length && history[0].role !== 'user') history.shift();
      const answer = await askClaude(data, history);
      // 답은 항상 질문보다 뒤에 정렬되도록 (같은 밀리초 방지)
      const at = new Date(Math.max(Date.now(), Date.parse(userMsg.at) + 1)).toISOString();
      await db.chats.put({ id: newId(), at, role: 'assistant', content: answer });
    } catch (e) {
      // 실패한 질문은 지우고 입력칸에 돌려놓는다
      await db.chats.delete(userMsg.id);
      setInput(q);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm('대화 기록을 모두 지울까요? 되돌릴 수 없어요.')) return;
    await db.chats.clear();
  }

  return (
    <div className="chat">
      <div className="chat-top">
        <div>
          <h2>Claude</h2>
          <p className="muted">예산·식단·식사 기록·체중을 보고 답해요. 대화는 이 폰에만 저장돼요.</p>
        </div>
        {msgs.length > 0 && <button className="btn" onClick={clear}>새 대화</button>}
      </div>

      {!hasKey && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          Claude API 키가 아직 없어요. 눌러서 설정에서 키를 넣어 주세요.
        </button>
      )}

      <div className="chat-log" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p className="muted">이렇게 물어볼 수 있어요</p>
            {SUGGEST.map((s) => (
              <button key={s} className="btn block" disabled={!hasKey || busy} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble-wrap ${m.role}`}>
            <p className={`chat-msg ${m.role}`}>{m.content}</p>
            <span className="chat-time">{time(m.at)}</span>
          </div>
        ))}
        {busy && (
          <div className="bubble-wrap assistant">
            <p className="chat-msg assistant typing" role="status">생각 중<span>.</span><span>.</span><span>.</span></p>
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          aria-label="메시지"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={hasKey ? 'Claude에게 메시지' : 'API 키를 먼저 넣어 주세요'}
          disabled={!hasKey}
        />
        <button className="btn primary icon" aria-label="보내기" disabled={busy || !hasKey || !input.trim()}>
          <ArrowUp size={20} aria-hidden />
        </button>
      </form>
    </div>
  );
}

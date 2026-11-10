import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUp, Check, ImagePlus, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Screen } from '../App';
import { runChatTurn, undoAction } from '../claude/agent';
import type { ApiMessage } from '../claude/client';
import { prepareImage } from '../claude/image';
import { newId } from '../db/actions';
import { db } from '../db/db';
import type { ChatMessage } from '../domain/types';
import type { AppData } from '../state/useAppData';

const SUGGEST = [
  '아침에 요거트랑 계란 2개만 먹었어',
  '오늘 다 먹었어',
  '편의점에서 삼각김밥 사 먹었어 1,500원',
  '몸무게 54.3',
  '이번 주 내 식사 어때? 뭘 더 먹을까?',
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
  const [image, setImage] = useState<{ mediaType: string; base64: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const hasKey = Boolean(data.settings.apiKey);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [msgs.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if ((!q && !image) || busy) return;
    const img = image;
    const userMsg: ChatMessage = { id: newId(), at: new Date().toISOString(), role: 'user', content: q || '(사진)', hadImage: Boolean(img) };
    await db.chats.put(userMsg);
    setInput('');
    setImage(null);
    setBusy(true);
    setErr(null);
    try {
      const past: ApiMessage[] = msgs.slice(-HISTORY).map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.actions?.length
          ? `${m.content}\n[기록함: ${m.actions.map((a) => `${a.summary}${a.undone ? ' (사용자가 되돌림)' : ''}`).join(' / ')}]`
          : `${m.content}${m.hadImage ? ' [사진 첨부했었음]' : ''}`,
      }));
      while (past.length && past[0].role !== 'user') past.shift();
      const now: ApiMessage = img
        ? { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } }, { type: 'text', text: q || '이 사진 내용을 기록해 줘' }] }
        : { role: 'user', content: q };
      const out = await runChatTurn(db, () => dataRef.current, [...past, now]);
      const at = new Date(Math.max(Date.now(), Date.parse(userMsg.at) + 1)).toISOString();
      const extra = out.errors.length && !out.actions.length ? `\n(기록 못 함: ${out.errors[0]})` : '';
      await db.chats.put({ id: newId(), at, role: 'assistant', content: (out.text || '알겠어요.') + extra, actions: out.actions });
    } catch (e) {
      await db.chats.delete(userMsg.id);
      setInput(q);
      if (img) setImage(img);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo(m: ChatMessage, i: number) {
    const a = m.actions?.[i];
    if (!a || a.undone) return;
    await undoAction(db, a);
    const actions = m.actions!.map((x, j) => (j === i ? { ...x, undone: true } : x));
    await db.chats.update(m.id, { actions });
  }

  async function clear() {
    if (!window.confirm('대화 기록을 모두 지울까요? (기록한 지출·식사는 그대로 남아요)')) return;
    await db.chats.clear();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const p = await prepareImage(file);
    setImage({ ...p, url: `data:${p.mediaType};base64,${p.base64}` });
  }

  return (
    <div className="chat">
      <div className="chat-top">
        <div>
          <h2>Claude</h2>
          <p className="muted">"이거 먹었어 / 샀어 / 얼마 나갔어"라고 말하면 바로 기록해요.</p>
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
            <p className="muted">이렇게 말해 보세요</p>
            {SUGGEST.map((s) => (
              <button key={s} className="btn block" disabled={!hasKey || busy} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble-wrap ${m.role}`}>
            <p className={`chat-msg ${m.role}`}>{m.hadImage ? '📷 ' : ''}{m.content}</p>
            {m.actions && m.actions.length > 0 && (
              <ul className="receipts" aria-label="기록한 내용">
                {m.actions.map((a, i) => (
                  <li key={i} className={a.undone ? 'undone' : ''}>
                    {a.undone ? <X size={15} aria-hidden /> : <Check size={15} aria-hidden />}
                    <span>{a.summary}{a.undone ? ' (되돌림)' : ''}</span>
                    {!a.undone && (
                      <button className="btn icon small" aria-label={`${a.summary} 되돌리기`} onClick={() => undo(m, i)}>
                        <Undo2 size={15} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <span className="chat-time">{time(m.at)}</span>
          </div>
        ))}
        {busy && (
          <div className="bubble-wrap assistant">
            <p className="chat-msg assistant typing" role="status">기록하는 중<span>.</span><span>.</span><span>.</span></p>
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
        {image && (
          <div className="attach-preview">
            <img src={image.url} alt="첨부할 사진" />
            <button type="button" className="btn icon small" aria-label="사진 빼기" onClick={() => setImage(null)}><X size={14} aria-hidden /></button>
          </div>
        )}
        <label className={`btn icon attach ${!hasKey ? 'disabled' : ''}`} aria-label="사진 첨부">
          <ImagePlus size={20} aria-hidden />
          <input type="file" accept="image/*" hidden disabled={!hasKey} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
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
          placeholder={hasKey ? '예: 점심에 볶음밥만 먹었어' : 'API 키를 먼저 넣어 주세요'}
          disabled={!hasKey}
        />
        <button className="btn primary icon" aria-label="보내기" disabled={busy || !hasKey || (!input.trim() && !image)}>
          <ArrowUp size={20} aria-hidden />
        </button>
      </form>
    </div>
  );
}

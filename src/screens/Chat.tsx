import { useState } from 'react';
import { askClaude } from '../claude/chat';
import { Card } from '../components/ui';
import type { AppData } from '../state/useAppData';

type Msg = { role: 'user' | 'assistant'; content: string };
const SUGGEST = ['이번 달 얼마 남았어?', '단백질을 제일 싸게 더 채우려면?', '+200kcal 늘리려면 뭘 더 먹고, 한 달에 얼마 더 들어?'];

export default function Chat({ data }: { data: AppData }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    setErr(null);
    try {
      const answer = await askClaude(data, next.slice(-12));
      setMsgs([...next, { role: 'assistant', content: answer }]);
    } catch (e) {
      setErr((e as Error).message);
      setMsgs(msgs);
      setInput(q);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Claude에게 묻기" action={msgs.length > 0 ? <button className="btn" onClick={() => setMsgs([])}>새 대화</button> : undefined}>
      <p className="muted">앱의 예산·식단·체중 데이터를 보고 답해요. 대화는 저장되지 않아요.</p>
      {msgs.length === 0 &&
        SUGGEST.map((s) => (
          <button key={s} className="btn block" onClick={() => send(s)}>{s}</button>
        ))}
      {msgs.map((m, i) => (
        <p key={i} className={`chat-msg ${m.role}`}>{m.content}</p>
      ))}
      {busy && <p className="muted" role="status">생각 중…</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input className="input" aria-label="질문" value={input} onChange={(e) => setInput(e.target.value)} placeholder="무엇이든 물어보세요" />
        <button className="btn primary" disabled={busy}>보내기</button>
      </form>
    </Card>
  );
}

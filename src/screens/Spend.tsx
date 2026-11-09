import { useState } from 'react';
import { Card, Field, Stat } from '../components/ui';
import { deleteExpense, recordExpense, recordPurchase, updateSettings } from '../db/actions';
import { db } from '../db/db';
import { formatKRW, parseAmount } from '../domain/money';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type PurchaseLine } from '../domain/types';
import type { AppData } from '../state/useAppData';
import CaptureFlow from './CaptureFlow';

const FOOD_ONLY: ExpenseCategory[] = ['저녁식비', '추가식품'];

export default function Spend({ data }: { data: AppData }) {
  const cats: ExpenseCategory[] = data.settings.logScope === 'food' ? FOOD_ONLY : EXPENSE_CATEGORIES.filter((c) => c !== '식단');
  const [date, setDate] = useState(data.today);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>(cats[0]);
  const [memo, setMemo] = useState('');
  const [packs, setPacks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const activeCategory = cats.includes(category) ? category : cats[0];

  const inPeriod = data.expenses
    .filter((e) => e.date >= data.period.start && e.date <= data.period.end)
    .filter((e) => !query || `${e.memo} ${e.category} ${e.amount}`.includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  async function addManual() {
    try {
      await recordExpense(db, { date, amount: parseAmount(amount) ?? 0, category: activeCategory, memo, source: 'manual' });
      setAmount('');
      setMemo('');
      setMsg({ tone: 'ok', text: '저장했어요.' });
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
    }
  }

  async function addPurchase() {
    const lines: PurchaseLine[] = [];
    for (const f of data.foods) {
      for (const o of f.packOptions) {
        const n = Math.round(Number(packs[`${f.id}|${o.label}`] ?? 0));
        if (n > 0) lines.push({ foodId: f.id, packLabel: o.label, packs: n, qtyAdded: n * o.qty, price: n * o.price });
      }
    }
    try {
      await recordPurchase(db, { date, lines });
      setPacks({});
      setMsg({ tone: 'ok', text: `식단 구매 ${formatKRW(lines.reduce((s, l) => s + l.price, 0))} 저장, 재고에 반영했어요.` });
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
    }
  }

  return (
    <>
      <div className="seg" style={{ marginBottom: 10 }}>
        {(['food', 'all'] as const).map((s) => (
          <button key={s} aria-pressed={data.settings.logScope === s} onClick={() => updateSettings(db, { logScope: s })}>
            {s === 'food' ? '식비만 기록' : '전부 기록'}
          </button>
        ))}
      </div>

      <CaptureFlow data={data} />

      {msg && <p className={`card ${msg.tone}`} role={msg.tone === 'err' ? 'alert' : 'status'}>{msg.text}</p>}

      <Card title="지출 직접 입력">
        <Field label="날짜"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="금액"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="카테고리">
          <select value={activeCategory} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="메모"><input value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        <button className="btn primary" onClick={addManual}>지출 추가</button>
      </Card>

      <Card title="식단 구매 직접 기록">
        <p className="muted">산 포장 수만 적으면 금액·재고가 자동으로 들어가요. 가격이 달랐다면 식단 화면에서 먼저 가격을 고쳐 주세요.</p>
        {data.foods.filter((f) => !f.free).flatMap((f) =>
          f.packOptions.map((o) => (
            <Field key={`${f.id}|${o.label}`} label={`${f.name} 팩 수 (${o.label})`}>
              <input
                inputMode="numeric"
                value={packs[`${f.id}|${o.label}`] ?? ''}
                placeholder={formatKRW(o.price)}
                onChange={(e) => setPacks({ ...packs, [`${f.id}|${o.label}`]: e.target.value })}
              />
            </Field>
          )),
        )}
        <button className="btn primary" onClick={addPurchase}>식단 구매 기록</button>
      </Card>

      <Card title={`이번 달 지출 (${data.period.start.slice(5)} ~ ${data.period.end.slice(5)})`}>
        <Field label="검색"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="메모·카테고리·금액" /></Field>
        {inPeriod.length === 0 && <p className="muted">기록이 없어요.</p>}
        {inPeriod.map((e) => (
          <div key={e.id} className="row">
            <Stat label={`${e.date.slice(5)} · ${e.category}${e.memo ? ` · ${e.memo}` : ''}`} value={formatKRW(e.amount)} />
            <button
              className="btn"
              aria-label={`${e.date} ${e.category} ${e.amount}원 삭제`}
              onClick={() => {
                if (window.confirm(`${formatKRW(e.amount)} 기록을 지울까요?`)) deleteExpense(db, e.id);
              }}
            >
              삭제
            </button>
          </div>
        ))}
      </Card>
    </>
  );
}

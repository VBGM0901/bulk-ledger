import { prepareImage } from '../claude/image';
import { useState } from 'react';
import { readCapture, toPurchaseLines, type CaptureItem, type CaptureResult } from '../claude/capture';
import { Card, Field } from '../components/ui';
import { recordExpense, recordPurchase } from '../db/actions';
import { db } from '../db/db';
import { formatKRW, parseAmount } from '../domain/money';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../domain/types';
import type { AppData } from '../state/useAppData';

const nonFood = (c: ExpenseCategory): ExpenseCategory => (c === '식단' ? '추가식품' : c);

export default function CaptureFlow({ data }: { data: AppData }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [res, setRes] = useState<CaptureResult | null>(null);
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [date, setDate] = useState(data.today);
  const [category, setCategory] = useState<ExpenseCategory>('식단');
  const [total, setTotal] = useState('');
  const foods = data.foods.filter((f) => !f.free);

  async function onFile(file: File) {
    setErr(null);
    setDone(null);
    setRes(null);
    setBusy(true);
    try {
      const r = await readCapture(data.settings.apiKey, await prepareImage(file), data.foods, data.today);
      setRes(r);
      setItems(r.items);
      setDate(r.date ?? data.today);
      setCategory(r.category);
      setTotal(String(r.total ?? r.items.reduce((s, i) => s + i.price, 0)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setItem = (i: number, patch: Partial<CaptureItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  async function save() {
    try {
      const lines = toPurchaseLines(items, data.foods);
      const amount = parseAmount(total) ?? 0;
      const foodSum = lines.reduce((s, l) => s + l.price, 0);
      if (lines.length > 0) {
        await recordPurchase(db, { date, lines, memo: res?.merchant ?? '캡처', source: 'capture' });
        const rest = amount - foodSum;
        if (rest > 0) await recordExpense(db, { date, amount: rest, category: nonFood(category), memo: '캡처 기타 품목', source: 'capture' });
      } else {
        await recordExpense(db, { date, amount, category: nonFood(category), memo: res?.merchant ?? '캡처', source: 'capture' });
      }
      setRes(null);
      setDone(`${formatKRW(amount)} 저장했어요.${lines.length ? ' 식단 재고에도 반영했어요.' : ''}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card title="캡처로 기록">
      <p className="muted">쿠팡 주문내역·영수증·카드 알림 캡처를 고르면 Claude가 읽어요. 저장 전에 확인할 수 있어요.</p>
      <Field label="캡처 올리기">
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </Field>
      {busy && <p className="muted" role="status">Claude가 읽는 중…</p>}
      {err && <p className="err" role="alert">{err}</p>}
      {done && <p className="ok" role="status">{done}</p>}
      {res && (
        <div>
          {items.map((it, i) => {
            const food = foods.find((f) => f.id === it.foodId);
            return (
              <div key={i} className="card" style={{ background: 'var(--molu-bg)' }}>
                <strong>{it.name}</strong>
                <div className="row">
                  <select
                    className="input"
                    aria-label={`${it.name} 식품`}
                    value={it.foodId ?? ''}
                    onChange={(e) => {
                      const f = foods.find((x) => x.id === e.target.value);
                      setItem(i, { foodId: f?.id ?? null, packLabel: f?.packOptions[0]?.label ?? null });
                    }}
                  >
                    <option value="">식단 아님</option>
                    {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  {food && (
                    <select className="input" aria-label={`${it.name} 포장`} value={it.packLabel ?? ''} onChange={(e) => setItem(i, { packLabel: e.target.value })}>
                      {food.packOptions.map((o) => <option key={o.label}>{o.label}</option>)}
                    </select>
                  )}
                </div>
                <div className="row">
                  {food && (
                    <input className="input small" aria-label={`${it.name} 수량`} inputMode="numeric" value={it.packs}
                      onChange={(e) => setItem(i, { packs: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                  )}
                  <input className="input" aria-label={`${it.name} 금액`} inputMode="numeric" value={it.price}
                    onChange={(e) => setItem(i, { price: parseAmount(e.target.value) ?? 0 })} />
                </div>
              </div>
            );
          })}
          <Field label="날짜"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="결제 합계"><input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label="식단 외 품목 카테고리">
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div className="row">
            <button className="btn" onClick={() => setRes(null)}>취소</button>
            <button className="btn primary" onClick={save}>이대로 저장</button>
          </div>
        </div>
      )}
    </Card>
  );
}

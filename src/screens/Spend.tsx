import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Screen } from '../App';
import { Card, Field } from '../components/ui';
import { deleteExpense, recordExpense, recordPurchase, updateExpense } from '../db/actions';
import { db } from '../db/db';
import { dow, monthDays, monthStart, shiftMonth } from '../domain/dates';
import { shortName } from '../domain/display';
import { frequentExpenses, type FavExpense } from '../domain/favorites';
import { compactKRW, spendByDay } from '../domain/spending';
import { formatKRW, parseAmount } from '../domain/money';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type PurchaseLine } from '../domain/types';
import type { AppData } from '../state/useAppData';

/** 직접 입력용 카테고리 ('식단'은 식단 구매 기록으로만 생긴다) */
const CATS: ExpenseCategory[] = EXPENSE_CATEGORIES.filter((c) => c !== '식단');

export default function Spend({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const [datePick, setDate] = useState('');
  const date = datePick || data.today; // 고르지 않았으면 항상 오늘
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>(CATS[0]);
  const [memo, setMemo] = useState('');
  const [packs, setPacks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null);
  const [query, setQuery] = useState('');

  // 달력: null = 이번 달 따라감. 날짜를 누르면 그날만 목록에
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const [dayPick, setDayPick] = useState<string | null>(null);
  const month = monthPick ?? monthStart(data.today);
  const days = monthDays(month);
  // 앱을 쓰기 시작한 날 (첫 기록) — 그 전 날짜엔 무지출 도장을 안 찍는다
  const since = [...data.expenses, ...data.intakes, ...data.weights, ...data.dinners].map((r) => r.date).sort()[0] ?? null;
  const spend = spendByDay(data.expenses, days, data.today, data.summary.dailyAllowance, since);
  const isCurrentMonth = month === monthStart(data.today);
  const moveMonth = (n: number) => {
    const m = shiftMonth(month, n);
    setMonthPick(m === monthStart(data.today) ? null : m);
    setDayPick(null);
  };
  const monthTotal = days.reduce((t, d) => t + spend[d].total, 0);

  const all = data.expenses
    .filter((e) => (dayPick ? e.date === dayPick : e.date.startsWith(month.slice(0, 7))))
    .sort((a, b) => b.date.localeCompare(a.date));
  const shown = all.filter((e) => !query || `${e.memo} ${e.category} ${e.amount}`.includes(query));
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];

  const favs = frequentExpenses(data.expenses);
  const [quick, setQuick] = useState<{ id: string; text: string } | null>(null);
  async function quickAdd(f: FavExpense) {
    const id = await recordExpense(db, { date: data.today, amount: f.amount, category: f.category, memo: f.memo, source: 'manual' });
    setQuick({ id, text: `${f.memo} ${formatKRW(f.amount)} 기록했어요.` });
  }

  async function addManual() {
    try {
      await recordExpense(db, { date, amount: parseAmount(amount) ?? 0, category, memo, source: 'manual' });
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
      setMsg({ tone: 'ok', text: `식단 구매 ${formatKRW(lines.reduce((t, l) => t + l.price, 0))} 저장, 재고에 반영했어요.` });
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
    }
  }

  return (
    <>
      <button className="card hint-card" onClick={() => navigate('chat')}>
        <MessageCircle size={20} aria-hidden />
        <span>
          <b>Claude 탭에서 "편의점 1,500원"처럼 말하면 기록돼요</b>
        </span>
      </button>

      {favs.length > 0 && (
        <section className="card" aria-label="자주 쓰는 지출">
          <div className="row"><h2>자주 쓰는 지출</h2><span className="muted">누르면 오늘로 바로 기록</span></div>
          <div className="fav-chips">
            {favs.map((f) => (
              <button key={`${f.memo}|${f.category}|${f.amount}`} className="chip-btn" onClick={() => quickAdd(f)}>
                {f.memo} <b className="num">{f.amount.toLocaleString('ko-KR')}</b>
              </button>
            ))}
          </div>
          {quick && (
            <p className="ok" role="status" style={{ margin: '8px 0 0' }}>
              {quick.text} <button className="link-btn" onClick={() => { deleteExpense(db, quick.id); setQuick(null); }}>되돌리기</button>
            </p>
          )}
        </section>
      )}


      <Card
        title={`${m}월 지출 ${formatKRW(monthTotal)}`}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn icon" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft size={18} aria-hidden /></button>
            <button className="btn icon" aria-label="다음 달" disabled={isCurrentMonth} onClick={() => moveMonth(1)}><ChevronRight size={18} aria-hidden /></button>
          </div>
        }
      >
        <div className="cal" role="group" aria-label={`${y}년 ${m}월 지출 달력`}>
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={w} className={`cal-head ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>)}
          {Array.from({ length: dow(month) }, (_, i) => <div key={`e${i}`} />)}
          {days.map((d) => {
            const sp = spend[d];
            const future = d > data.today;
            return (
              <button
                key={d}
                className={`cal-day spend ${sp.big ? 'big' : ''} ${sp.noSpend ? 'nospend' : ''} ${d === dayPick ? 'sel' : ''} ${d === data.today ? 'today' : ''}`}
                disabled={future}
                aria-pressed={d === dayPick}
                aria-label={`${Number(d.slice(8))}일${sp.total ? ` ${sp.total}원` : ''}${sp.big ? ' 큰 지출' : ''}${sp.noSpend ? ' 무지출' : ''}`}
                onClick={() => setDayPick(d === dayPick ? null : d)}
              >
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-pct">{sp.other ? compactKRW(sp.other) : sp.noSpend ? '✓' : ''}</span>
                <span className="cal-kg">{sp.food ? `🛒${compactKRW(sp.food)}` : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted">
          <span><i className="dot nospend" />무지출</span>
          <span><i className="dot big" />큰 지출</span>
          <span>🛒 식단 장보기</span>
        </div>
      </Card>

      <Card
        title={dayPick ? `${Number(dayPick.slice(5, 7))}월 ${Number(dayPick.slice(8))}일 지출` : `${m}월 지출 목록`}
        action={dayPick ? <button className="btn" onClick={() => setDayPick(null)}>{m}월 전체</button> : undefined}
      >
        {all.length > 8 && (
          <Field label="검색"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="메모·카테고리·금액" /></Field>
        )}
        {shown.length === 0 && <p className="muted">기록이 없어요.</p>}
        {shown.map((e) => (
          <ExpenseRow key={e.id} e={e} linked={data.purchases.some((p) => p.expenseId === e.id)} today={data.today} />
        ))}
      </Card>

      <button className="btn block manage-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '직접 입력 닫기 ▴' : '직접 입력 ▾'}
      </button>

      {msg && <p className={`card ${msg.tone}`} role={msg.tone === 'err' ? 'alert' : 'status'}>{msg.text}</p>}

      {open && (
        <>
          <Card title="지출">
            <Field label="날짜"><input type="date" value={date} max={data.today} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="금액"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
            <Field label="카테고리">
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="메모"><input value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <button className="btn primary" onClick={addManual}>지출 추가</button>
          </Card>

          <Card title="식단 구매 (재고에도 반영)">
            <p className="muted">산 개수만 적으면 금액은 등록된 가격으로 들어가요.</p>
            {data.foods.filter((f) => !f.free).flatMap((f) =>
              f.packOptions.map((o) => (
                <div key={`${f.id}|${o.label}`} className="row pack-row">
                  <span>{shortName(f)} <small className="muted">{o.label} · {formatKRW(o.price)}</small></span>
                  <input
                    className="input small"
                    inputMode="numeric"
                    aria-label={`${f.name} 팩 수 (${o.label})`}
                    value={packs[`${f.id}|${o.label}`] ?? ''}
                    placeholder="0"
                    onChange={(e) => setPacks({ ...packs, [`${f.id}|${o.label}`]: e.target.value })}
                  />
                </div>
              )),
            )}
            <button className="btn primary" onClick={addPurchase}>식단 구매 기록</button>
          </Card>
        </>
      )}
    </>
  );
}

/** 지출 한 줄. 누르면 그 자리에서 고칠 수 있다 (장보기는 금액·메모만). */
function ExpenseRow({ e, linked, today }: { e: Expense; linked: boolean; today: string }) {
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(String(e.amount));
  const [memo, setMemo] = useState(e.memo);
  const [date, setDate] = useState(e.date);
  const [category, setCategory] = useState<ExpenseCategory>(e.category);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    try {
      await updateExpense(db, e.id, linked ? { amount: parseAmount(amount) ?? 0, memo } : { amount: parseAmount(amount) ?? 0, memo, date, category });
      setEdit(false);
      setErr(null);
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  if (!edit) {
    return (
      <div className="row expense-row">
        <button className="expense-main" aria-label={`${e.memo || e.category} ${e.amount}원 고치기`} onClick={() => setEdit(true)}>
          <b>{e.memo || e.category}</b>
          <small className="muted">{e.date.slice(5)} · {e.category}</small>
        </button>
        <span className="row" style={{ gap: 6 }}>
          <b className="num">{formatKRW(e.amount)}</b>
          <button
            className="btn icon small danger"
            aria-label={`${e.date} ${e.category} ${e.amount}원 삭제`}
            onClick={() => {
              if (window.confirm(`${formatKRW(e.amount)} 기록을 지울까요?`)) deleteExpense(db, e.id);
            }}
          >
            ×
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="expense-edit" aria-label="지출 고치기">
      <div className="row">
        <label className="field"><span>금액</span><input inputMode="numeric" value={amount} onChange={(x) => setAmount(x.target.value)} /></label>
        <label className="field"><span>메모</span><input value={memo} onChange={(x) => setMemo(x.target.value)} /></label>
      </div>
      {!linked && (
        <div className="row">
          <label className="field"><span>날짜</span><input type="date" value={date} max={today} onChange={(x) => x.target.value && setDate(x.target.value)} /></label>
          <label className="field"><span>카테고리</span>
            <select value={category} onChange={(x) => setCategory(x.target.value as ExpenseCategory)}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      )}
      {linked && <p className="muted small-note">식단 장보기는 재고와 연결돼 있어서 금액·메모만 고칠 수 있어요.</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        <button className="btn" onClick={() => { setEdit(false); setErr(null); }}>취소</button>
        <button className="btn primary" onClick={save}>저장</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

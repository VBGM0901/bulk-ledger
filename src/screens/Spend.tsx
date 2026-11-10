import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Screen } from '../App';
import { Card, Field, Stat } from '../components/ui';
import { deleteExpense, recordExpense, recordPurchase } from '../db/actions';
import { db } from '../db/db';
import { dow, monthDays, monthStart, shiftMonth } from '../domain/dates';
import { shortName } from '../domain/display';
import { compactKRW, spendByDay } from '../domain/spending';
import { formatKRW, parseAmount } from '../domain/money';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type PurchaseLine } from '../domain/types';
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
  const spend = spendByDay(data.expenses, days, data.today, data.summary.dailyAllowance);
  const isCurrentMonth = month === monthStart(data.today);
  const moveMonth = (n: number) => {
    const m = shiftMonth(month, n);
    setMonthPick(m === monthStart(data.today) ? null : m);
    setDayPick(null);
  };
  const noSpendDays = days.filter((d) => spend[d].noSpend).length;
  const monthTotal = days.reduce((t, d) => t + spend[d].total, 0);

  const all = data.expenses
    .filter((e) => (dayPick ? e.date === dayPick : e.date.startsWith(month.slice(0, 7))))
    .sort((a, b) => b.date.localeCompare(a.date));
  const shown = all.filter((e) => !query || `${e.memo} ${e.category} ${e.amount}`.includes(query));
  const s = data.summary;
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];

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
          <b>Claude 탭에서 말로 기록하세요</b>
          <small className="muted">"편의점 1,500원", "바나나 1송이 샀어", 영수증 사진도 돼요</small>
        </span>
      </button>

      <Card title={`예산월 (${data.period.start.slice(5)} ~ ${data.period.end.slice(5)})`}>
        <Stat label="식단 구매" value={formatKRW(s.foodSpent)} sub={`계획 ${formatKRW(s.foodPlan)}`} />
        <Stat label="그 외 지출" value={formatKRW(s.otherSpent)} sub={`하루 쓸 수 있는 돈 ${formatKRW(s.dailyAllowance)}`} />
      </Card>

      <Card
        title={`${y}년 ${m}월 지출`}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn icon" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft size={18} aria-hidden /></button>
            <button className="btn icon" aria-label="다음 달" disabled={isCurrentMonth} onClick={() => moveMonth(1)}><ChevronRight size={18} aria-hidden /></button>
          </div>
        }
      >
        <div className="cal" role="grid" aria-label={`${y}년 ${m}월 지출 달력`}>
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
          <span><i className="dot nospend" />무지출(장보기 빼고)</span>
          <span><i className="dot big" />큰 지출</span>
          <span>🛒 식단 장보기</span>
        </div>
        <Stat label="이 달 쓴 돈" value={formatKRW(monthTotal)} sub={`무지출 ${noSpendDays}일`} />
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
          <div key={e.id} className="row expense-row">
            <span>
              <b>{e.memo || e.category}</b>
              <small className="muted">{e.date.slice(5)} · {e.category}</small>
            </span>
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

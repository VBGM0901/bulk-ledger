import { useRef, useState } from 'react';
import type { Screen } from '../App';
import { Bar, Card, Notice, Stat } from '../components/ui';
import { updateSettings } from '../db/actions';
import { db } from '../db/db';
import { depletionDate } from '../domain/consumption';
import { addDays } from '../domain/dates';
import { shortName } from '../domain/display';
import { formatKRW, parseAmount } from '../domain/money';
import type { AppData } from '../state/useAppData';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 가계부 탭 맨 위: 쓸 수 있는 돈 + 월급·남은 돈 입력 + 고정비·식비 + 곧 사야 할 식품 */
export function MoneyTop({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const { summary: s, period } = data;
  const soonLimit = addDays(data.today, 3);
  const tracked = new Set(data.stockEvents.map((e) => e.foodId));
  const soon = data.foods
    .filter((f) => !f.free && (data.dailyUse[f.id] ?? 0) > 0 && tracked.has(f.id))
    .map((f) => ({ f, date: depletionDate(data.stock[f.id] ?? 0, data.dailyUse[f.id], data.today) }))
    .filter((x): x is { f: typeof x.f; date: string } => x.date !== null && x.date <= soonLimit);

  return (
    <>
      <section className="hero">
        {data.balance ? (
          <>
            <div className="label">지금 남은 돈 · {md(data.balance.since)} 입력{data.balance.spentSince ? ` 후 ${formatKRW(data.balance.spentSince)} 씀` : ''}</div>
            <div className="big num">{formatKRW(data.balance.now)}</div>
            <div className="label">
              하루 사용 가능 <span className="num">{formatKRW(data.balance.daily)}</span> · {s.daysLeft}일 남음
              {data.balance.unpaidFixed + data.balance.foodLeft > 0 && <><br />안 낸 고정비 {formatKRW(data.balance.unpaidFixed)} · 남은 장보기 {formatKRW(data.balance.foodLeft)} 빼고 계산</>}
            </div>
          </>
        ) : (
          <>
            <div className="label">{md(period.start)} ~ {md(period.end)} 고정비·식비 빼고 쓸 수 있는 돈</div>
            <div className="big num">{data.needsSetup ? '입력 필요' : formatKRW(s.remaining)}</div>
            <div className="label">
              하루 사용 가능 <span className="num">{formatKRW(s.dailyAllowance)}</span> · {s.daysLeft}일 남음
            </div>
          </>
        )}
      </section>

      {data.needsSetup && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          수입·고정비가 아직 없어요. 눌러서 설정에서 개인 데이터 파일을 불러오거나 직접 입력하세요.
        </button>
      )}
      {s.missing.length > 0 && <Notice tone="warn">미입력: {s.missing.join(', ')} — 설정에서 입력하세요.</Notice>}
      {s.overBudget && !data.needsSetup && <Notice tone="err">고정비·식단 계획·쓴 돈을 합치면 수입보다 {formatKRW(-s.remaining)} 많아요.</Notice>}
      {data.plan.missing.length > 0 && <Notice tone="warn">가격이 없는 식품이 있어 식단비가 덜 잡혔어요: {data.plan.missing.map((id) => shortName(data.foods.find((f) => f.id === id))).join(', ')}</Notice>}

      <Card title="이번 예산월 돈">
        <SalaryField data={data} />
        <BalanceField data={data} />
        <FixedChecklist data={data} />
        <div className="money-row">
          <span className="muted">식단 장보기</span>
          <span className="num"><b>{formatKRW(s.foodSpent)}</b> <small className="muted">/ {formatKRW(s.foodPlan)}</small></span>
        </div>
        <Bar value={s.foodSpent} max={Math.max(1, s.foodPlan)} label="이번 달 장보기 계획 중 산 비율" />
        <Stat label="식단 외 지출" value={formatKRW(s.otherSpent)} />
      </Card>

      {soon.length > 0 && (
        <Card title="곧 사야 함" action={<button className="btn" onClick={() => navigate('shopping')}>장보기</button>}>
          {soon.map(({ f, date }) => (
            <Stat key={f.id} label={shortName(f)} value={date <= data.today ? '재고 없음' : `${md(date)} 소진`} tone="warn" />
          ))}
        </Card>
      )}
    </>
  );
}

/**
 * 금액 입력칸: 쓰는 동안 0.8초 멈추면 자동 저장, 칸에서 나와도 저장 (아이폰 숫자 키패드엔 완료 키가 없어서).
 * 입력 중엔 바깥 값으로 덮어쓰지 않는다.
 */
function AmountInput({ label, value, placeholder, onSave }: {
  label: string; value: number | null; placeholder: string; onSave: (v: number | null) => Promise<void>;
}) {
  const fmt = (v: number | null) => (v === null ? '' : v.toLocaleString('ko-KR'));
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const shown = focused ? draft : fmt(value);
  async function commit(text: string) {
    window.clearTimeout(timer.current);
    const v = text.trim() === '' ? null : parseAmount(text);
    if (text.trim() !== '' && (v === null || v < 0)) return;
    if (v === value) return;
    await onSave(v);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }
  return (
    <span className="amount-input">
      {saved && <small className="ok">저장됨</small>}
      <input
        className="input num salary-input"
        inputMode="numeric"
        aria-label={label}
        value={shown}
        placeholder={placeholder}
        onFocus={() => { setDraft(fmt(value)); setFocused(true); }}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(t), 800);
        }}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      />
    </span>
  );
}

/** 월급: 바로 입력 (설정의 첫 번째 수입과 같은 값) */
function SalaryField({ data }: { data: AppData }) {
  const salary = data.incomes[0];
  const others = data.incomes.slice(1).reduce((t, i) => t + (i.amount ?? 0), 0);
  return (
    <div className="quick-weight">
      <span className="muted">월급{others ? ` (그 외 수입 ${formatKRW(others)})` : ''}</span>
      <AmountInput
        label="월급"
        value={salary?.amount ?? null}
        placeholder="월급 입력"
        onSave={async (v) => {
          if (v === null) return;
          if (salary) await db.incomes.update(salary.id, { amount: v });
          else await db.incomes.put({ id: 'salary', name: '월급', amount: v });
        }}
      />
    </div>
  );
}

/** 지금 남은 돈: 통장 잔액 등 실제 금액을 넣으면 홈 맨 위가 그 기준으로 바뀐다. 비우면 계획 기준으로 돌아감 */
function BalanceField({ data }: { data: AppData }) {
  const b = data.balance;
  return (
    <div className="quick-weight">
      <span className="muted">지금 남은 돈{b ? ` (${md(b.since)} 기준)` : ''}</span>
      <AmountInput
        label="지금 남은 돈"
        value={b ? data.settings.balance!.amount : null}
        placeholder="잔액 입력"
        onSave={(v) => updateSettings(db, { balance: v === null ? null : { amount: v, date: data.today } })}
      />
    </div>
  );
}

/** 고정비: 빠져나갔으면 체크. 체크 안 한 건 '남은 돈'에서 미리 빼 둔다. 월급날이 지나면 자동으로 다시 비어 있음 */
function FixedChecklist({ data }: { data: AppData }) {
  const paid = data.paidIds;
  const total = data.recurring.reduce((t, r) => t + (r.monthlyBudget ?? 0), 0);
  const paidSum = data.recurring.filter((r) => paid.includes(r.id)).reduce((t, r) => t + (r.monthlyBudget ?? 0), 0);
  async function toggle(id: string) {
    const ids = paid.includes(id) ? paid.filter((x) => x !== id) : [...paid, id];
    await updateSettings(db, { paidFixed: { period: data.period.start, ids } });
  }
  return (
    <div className="fixed-list" aria-label="고정비 납부">
      <div className="money-row">
        <span className="muted">고정비 <small>(나간 것 체크)</small></span>
        <span className="num"><b>{formatKRW(paidSum)}</b> <small className="muted">/ {formatKRW(total)}</small></span>
      </div>
      <div className="fav-chips">
        {data.recurring.map((r) => {
          const on = paid.includes(r.id);
          return (
            <button key={r.id} className={`chip-btn ${on ? 'paid' : ''}`} aria-pressed={on} onClick={() => toggle(r.id)}>
              {on ? '✓ ' : ''}{r.name} <b className="num">{formatKRW(r.monthlyBudget ?? 0)}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

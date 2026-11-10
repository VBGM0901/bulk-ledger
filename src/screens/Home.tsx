import { useRef, useState } from 'react';
import type { Screen } from '../App';
import { Bar, Card, Notice, Stat } from '../components/ui';
import { depletionDate } from '../domain/consumption';
import { addDays } from '../domain/dates';
import { formatKRW, formatNum, parseAmount } from '../domain/money';
import { shortName } from '../domain/display';
import { weeklyReview } from '../domain/checkin';
import { dayIntake } from '../domain/intake';
import { logWeight, updateSettings, weeklyCheckin } from '../db/actions';
import { db } from '../db/db';
import { forecastDate, goalWeightOn, movingAverage } from '../domain/weight';
import type { AppData } from '../state/useAppData';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Home({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const { summary: s, nutrition: n, settings, period } = data;
  const avg = movingAverage(data.weights, data.today);
  const goal = settings.weightGoal;
  const soonLimit = addDays(data.today, 3);
  const tracked = new Set(data.stockEvents.map((e) => e.foodId));
  const planned = data.foods.filter((f) => !f.free && (data.dailyUse[f.id] ?? 0) > 0);
  const soon = planned
    .filter((f) => tracked.has(f.id))
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
              하루 사용 가능 <span className="num">{formatKRW(data.balance.daily)}</span> · {s.daysLeft}일 남음 · 계획상 {formatKRW(s.remaining)}
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
      {data.backupStale && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          백업한 지 7일이 넘었어요. 눌러서 백업하기
        </button>
      )}

      <WeeklyCheckin data={data} navigate={navigate} />

      <Card title="오늘 먹은 것" action={<button className="btn primary" onClick={() => navigate('log')}>체크하기</button>}>
        {(() => {
          const it = data.todayIntake;
          const kcal = it?.kcal ?? 0;
          const protein = it?.protein ?? 0;
          return (
            <>
              <Stat
                label="칼로리"
                value={`${formatNum(kcal)} / ${formatNum(settings.kcalTarget)} kcal`}
                sub={it ? `${Math.round(it.pct * 100)}%` : '아직 체크 안 함'}
                tone={it ? (it.grade === 'good' ? 'ok' : 'warn') : undefined}
              />
              <Bar value={kcal} max={settings.kcalTarget} label="오늘 칼로리 목표 대비" />
              <Stat
                label="단백질"
                value={`${formatNum(protein, 1)} g`}
                sub={`목표 ${settings.proteinTarget[0]}~${settings.proteinTarget[1]}g`}
                tone={it ? (protein >= settings.proteinTarget[0] ? 'ok' : 'warn') : undefined}
              />
              <p className="muted" style={{ margin: '6px 0 0' }}>계획대로 다 먹으면 {formatNum(n.kcal)}kcal · 단백질 {formatNum(n.protein, 1)}g</p>
            </>
          );
        })()}
      </Card>

      <WeekStamp data={data} onOpen={() => navigate('log')} />

      <Card title="이번 예산월 돈">
        <SalaryField data={data} />
        <BalanceField data={data} />
        <Stat label="고정·정기" value={formatKRW(s.fixed)} />
        <Stat label={s.foodSpent > s.foodPlan ? '식단 (계획보다 더 삼)' : '식단 계획'} value={formatKRW(Math.max(s.foodPlan, s.foodSpent))} />
        <Stat label="식단 외 지출" value={formatKRW(s.otherSpent)} />
        <Bar value={s.fixed + Math.max(s.foodPlan, s.foodSpent) + s.otherSpent} max={Math.max(1, s.income)} label="수입 대비 지출" />
      </Card>

      <Card title="체중">
        <QuickWeight data={data} />
        <Stat label="7일 평균" value={avg === null ? '기록 없음' : `${formatNum(avg, 1)} kg`} />
        <Stat label="제안" value={data.advice.title} tone={data.advice.kind === 'on-track' ? 'ok' : data.advice.kind === 'need-data' ? undefined : 'warn'} />
        {goal && (() => {
          const f = forecastDate(data.weights, goal, data.today);
          return f ? <Stat label={`${goal.targetKg}kg 도달 예상`} value={`${Number(f.slice(5, 7))}월 ${Number(f.slice(8))}일쯤`} tone={f <= goal.endDate ? 'ok' : 'warn'} /> : null;
        })()}
        {goal && <Stat label="오늘 목표선" value={`${formatNum(goalWeightOn(goal, data.today), 1)} kg`} sub={`최종 ${goal.targetKg}kg`} />}
      </Card>

      {soon.length > 0 && (
        <Card title="곧 사야 함" action={<button className="btn" onClick={() => navigate('shopping')}>장보기</button>}>
          {soon.map(({ f, date }) => (
            <Stat key={f.id} label={f.name} value={date <= data.today ? '재고 없음' : `${md(date)} 소진`} tone="warn" />
          ))}
        </Card>
      )}
    </>
  );
}

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

/** 이번 주(월~일) 7칸 도장. 하루 빠져도 0으로 돌아가지 않는다. */
function WeekStamp({ data, onOpen }: { data: AppData; onOpen: () => void }) {
  const dow = (new Date(`${data.today}T00:00:00`).getDay() + 6) % 7; // 월=0
  const monday = addDays(data.today, -dow);
  const days = WEEK.map((w, i) => {
    const date = addDays(monday, i);
    return { w, date, it: dayIntake(date, data.foods, data.settings, data.dinners, data.intakes), future: date > data.today };
  });
  const good = days.filter((d) => d.it?.grade === 'good').length;
  return (
    <button className="card week-stamp" onClick={onOpen} aria-label={`이번 주 잘 먹은 날 ${good}일. 눌러서 기록 보기`}>
      <div className="row">
        <h2>이번 주</h2>
        <span className="muted">95% 이상 먹은 날 <b className="num ok">{good}</b>/7</span>
      </div>
      <div className="stamps">
        {days.map((d) => (
          <span key={d.date} className={`stamp ${d.it ? `g-${d.it.grade}` : ''} ${d.future ? 'future' : ''} ${d.date === data.today ? 'today' : ''}`}>
            <i>{d.it ? `${Math.round(d.it.pct * 100)}%` : ''}</i>
            <small>{d.w}</small>
          </span>
        ))}
      </div>
    </button>
  );
}

/** 주간 체크인: 지난 7일 요약 + 제안을 버튼 한 번으로 (MacroFactor식). 이번 주에 한 번만. */
function WeeklyCheckin({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const r = weeklyReview(data.today, data.settings, data.foods, data.dinners, data.intakes, data.weights, data.advice);
  if (!r) return null;
  const mine = (data.settings.checkins ?? []).find((c) => c.week === r.week);
  if (r.done) {
    if (!mine || mine.choice !== 'apply') return null;
    return (
      <button className="card hint-card" onClick={() => navigate('diet')}>
        <span>
          <b>이번 주 목표: {formatNum(mine.kcalAfter)}kcal ({mine.delta > 0 ? '+' : ''}{mine.delta})</b>
          <small className="muted">식단 탭 → 식단 편집에서 음식을 {mine.delta > 0 ? '추가' : '줄여'}하세요. 뭘 바꿀지 Claude에게 물어봐도 돼요.</small>
        </span>
      </button>
    );
  }
  const advice = data.advice;
  return (
    <section className="card checkin" aria-label="주간 체크인">
      <div className="row"><h2>주간 체크인</h2><span className="muted">지난 7일</span></div>
      <div className="day-sum">
        <div><span className="muted">잘 먹은 날</span><b className="num">{r.goodDays}/7</b></div>
        <div><span className="muted">평균 달성</span><b className="num">{r.avgPct === null ? '–' : `${Math.round(r.avgPct * 100)}%`}</b></div>
        <div><span className="muted">체중 1주</span><b className="num">{advice.rate === null ? '–' : `${advice.rate >= 0 ? '+' : ''}${formatNum(advice.rate, 1)}`}</b><small className="muted">{advice.rate === null ? '' : 'kg'}</small></div>
      </div>
      <p className="advice"><strong>{advice.title}</strong></p>
      <p className="muted" style={{ marginTop: 0 }}>{advice.detail}</p>
      {r.weighIns < 3 && <p className="muted small-note">체중을 주 3번 이상 재면 판단이 정확해져요.</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        {r.delta !== 0 ? (
          <>
            <button className="btn" onClick={() => weeklyCheckin(db, r.week, 'keep', 0)}>이번 주는 유지</button>
            <button className="btn primary" onClick={() => weeklyCheckin(db, r.week, 'apply', r.delta)}>
              목표 {r.delta > 0 ? '+' : ''}{r.delta}kcal
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => weeklyCheckin(db, r.week, 'ok', 0)}>확인했어요</button>
        )}
      </div>
      <p className="muted small-note">참고용 계산이에요. 한 번에 250kcal 넘게 바꾸지 않아요.</p>
    </section>
  );
}

/** 오늘 체중: 숫자 입력하고 저장 */
function QuickWeight({ data }: { data: AppData }) {
  const todayLog = data.weights.find((w) => w.date === data.today);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      await logWeight(db, data.today, Number(draft));
      setDraft('');
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="quick-weight">
      <span className="muted">오늘 체중{todayLog ? ` · ${formatNum(todayLog.kg, 1)}kg 저장됨` : ''}</span>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input
          className="input small num"
          inputMode="decimal"
          aria-label="오늘 체중(kg)"
          value={draft}
          placeholder={String(todayLog?.kg ?? data.weights.at(-1)?.kg ?? 'kg')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" disabled={!draft.trim()}>저장</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
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

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Bar, Card } from '../components/ui';
import { copyDayMeals, deleteWeight, logWeight, markAllEaten } from '../db/actions';
import { db } from '../db/db';
import { addDays, dow, monthDays, monthStart, shiftMonth } from '../domain/dates';
import { frequentExtras } from '../domain/favorites';
import { dayIntake, type DayIntake } from '../domain/intake';
import { formatNum } from '../domain/money';
import { dailyNutrition } from '../domain/nutrition';
import type { DinnerChoice, ISODate } from '../domain/types';
import type { AppData } from '../state/useAppData';
import { ExtraFoods, MealChecklist } from './LogParts';
import { WeightTrend } from './Weight';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const GRADE_LABEL = { good: '잘 먹음', ok: '조금 부족', low: '많이 부족' } as const;

export default function Log({ data }: { data: AppData }) {
  // null = '오늘'을 따라감 (앱을 켜 둔 채 날이 바뀌어도 새 오늘로)
  const [monthPick, setMonthPick] = useState<ISODate | null>(null);
  const [selPick, setSelPick] = useState<ISODate | null>(null);
  const month = monthPick ?? monthStart(data.today);
  const sel = selPick ?? data.today;
  const setSel = (d: ISODate) => setSelPick(d === data.today ? null : d);
  const setMonth = (m: ISODate) => {
    const current = m === monthStart(data.today);
    setMonthPick(current ? null : m);
    // 달을 바꾸면 그 달의 마지막 날(이번 달이면 오늘)을 고른다
    setSelPick(current ? null : addDays(shiftMonth(m, 1), -1));
  };
  const days = monthDays(month);
  const intakeOf = (d: ISODate) => dayIntake(d, data.foods, data.settings, data.dinners, data.intakes);
  const weightOf = (d: ISODate) => data.weights.find((w) => w.date === d)?.kg ?? null;

  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const isCurrentMonth = month === monthStart(data.today);

  return (
    <>
      <Card
        title={`${y}년 ${m}월`}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn icon" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} aria-hidden /></button>
            <button className="btn icon" aria-label="다음 달" disabled={isCurrentMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} aria-hidden /></button>
          </div>
        }
      >
        <div className="cal" role="group" aria-label={`${y}년 ${m}월 기록 달력`}>
          {WEEK.map((w, i) => <div key={w} className={`cal-head ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>)}
          {Array.from({ length: dow(month) }, (_, i) => <div key={`e${i}`} />)}
          {days.map((d) => {
            const it = intakeOf(d);
            const kg = weightOf(d);
            const future = d > data.today;
            return (
              <button
                key={d}
                className={`cal-day ${it ? `g-${it.grade}` : ''} ${d === sel ? 'sel' : ''} ${d === data.today ? 'today' : ''}`}
                disabled={future}
                aria-pressed={d === sel}
                aria-label={`${Number(d.slice(8))}일${it ? ` 식사 ${Math.round(it.pct * 100)}% ${GRADE_LABEL[it.grade]}` : ''}${kg !== null ? ` 체중 ${kg}kg` : ''}`}
                onClick={() => setSel(d)}
              >
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-pct">{it ? `${Math.round(it.pct * 100)}%` : ''}</span>
                <span className="cal-kg">{kg !== null ? formatNum(kg, 1) : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted">
          <span><i className="dot g-good" />95%↑</span>
          <span><i className="dot g-ok" />75%↑</span>
          <span><i className="dot g-low" />부족</span>
          <span>아래 숫자 = 체중</span>
        </div>
      </Card>

      <DayEditor key={sel} data={data} date={sel} intake={intakeOf(sel)} weight={weightOf(sel)} />

      <WeightTrend data={data} />
    </>
  );
}

function DayEditor({ data, date, intake, weight }: { data: AppData; date: ISODate; intake: DayIntake | null; weight: number | null }) {
  const [kg, setKg] = useState(weight === null ? '' : String(weight));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const log = data.intakes.find((l) => l.date === date);
  const choice: DinnerChoice = data.dinners.find((d) => d.date === date)?.choice ?? 'meat';
  const plan = dailyNutrition(data.foods, data.settings.meals, data.settings.dinner[choice]);
  const names = plan.byMeal.map((m) => m.name);
  const label = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${WEEK[dow(date)]})${date === data.today ? ' · 오늘' : ''}`;

  const proteinOk = intake ? intake.protein >= data.settings.proteinTarget[0] : false;

  return (
    <>
      <section className="card day-head">
        <div className="row">
          <h2>{label}</h2>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn" onClick={async () => {
              if (log && !window.confirm('이 날 체크한 끼니를 어제 기록으로 바꿀까요? (추가 음식은 그대로)')) return;
              const ok = await copyDayMeals(db, addDays(date, -1), date);
              setCopyMsg(ok ? '어제 먹은 대로 체크했어요. 다르게 먹은 것만 고쳐 주세요.' : '전날 기록이 없어요.');
            }}>어제처럼</button>
            <button className="btn primary" onClick={() => markAllEaten(db, date, names)}>전부 다 먹음</button>
          </span>
        </div>
        <div className="day-sum">
          <div>
            <span className="muted">칼로리</span>
            <b className={`num ${intake ? (intake.grade === 'good' ? 'ok' : 'warn') : ''}`}>
              {intake ? formatNum(intake.kcal) : '0'}
            </b>
            <small className="muted"> / {formatNum(intake?.target ?? data.settings.kcalTarget)}</small>
          </div>
          <div>
            <span className="muted">단백질</span>
            <b className={`num ${intake ? (proteinOk ? 'ok' : 'warn') : ''}`}>{intake ? formatNum(intake.protein, 1) : '0'}g</b>
            <small className="muted"> / {data.settings.proteinTarget.join('~')}g</small>
          </div>
          <div>
            <span className="muted">달성</span>
            <b className="num">{intake ? `${Math.round(intake.pct * 100)}%` : '–'}</b>
          </div>
        </div>
        <Bar value={intake?.kcal ?? 0} max={data.settings.kcalTarget} label="그날 칼로리 목표 대비" />
        {copyMsg && <p className="muted" style={{ margin: 0 }}>{copyMsg}</p>}
      </section>

      {data.settings.meals.map((meal, i) => (
        <MealChecklist key={meal.name} data={data} date={date} meal={meal} index={i} log={log} choice={choice} />
      ))}

      <ExtraFoods date={date} log={log} favs={frequentExtras(data.intakes)} />

      <section className="card">
        <div className="row weight-row">
          <label className="field" style={{ margin: 0 }}>
            <span>그날 체중(kg)</span>
            <input inputMode="decimal" value={kg} onChange={(e) => { setKg(e.target.value); setSaved(false); }} placeholder="kg" />
          </label>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await logWeight(db, date, Number(kg));
                setErr(null);
                setSaved(true);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            체중 저장
          </button>
          {weight !== null && (
            <button className="btn" aria-label="그날 체중 지우기" onClick={() => { deleteWeight(db, date); setKg(''); }}>
              지우기
            </button>
          )}
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        {saved && !err && <p className="ok" role="status">저장했어요.</p>}
      </section>
    </>
  );
}

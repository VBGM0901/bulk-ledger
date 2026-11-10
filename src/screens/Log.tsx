import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Bar, Card, Stat } from '../components/ui';
import { deleteWeight, logWeight, markAllEaten, setDinner, setMealStatus } from '../db/actions';
import { db } from '../db/db';
import { addDays } from '../domain/dates';
import { dayIntake, STATUS_LABEL, type DayIntake } from '../domain/intake';
import { formatNum } from '../domain/money';
import { dailyNutrition } from '../domain/nutrition';
import type { DinnerChoice, ISODate, MealStatus } from '../domain/types';
import type { AppData } from '../state/useAppData';
import { WeightTrend } from './Weight';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const STATUSES: MealStatus[] = ['all', 'half', 'none'];
const DINNER: { id: DinnerChoice; label: string }[] = [
  { id: 'meat', label: '고기 있음' },
  { id: 'none', label: '고기 없음' },
  { id: 'less', label: '덜 먹음' },
];
const GRADE_LABEL = { good: '잘 먹음', ok: '조금 부족', low: '많이 부족' } as const;

const dow = (d: ISODate) => new Date(`${d}T00:00:00`).getDay();
const monthStart = (d: ISODate) => `${d.slice(0, 7)}-01`;
function shiftMonth(first: ISODate, n: number): ISODate {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}
function monthDays(first: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
}

export default function Log({ data }: { data: AppData }) {
  const [month, setMonth] = useState(monthStart(data.today));
  const [sel, setSel] = useState<ISODate>(data.today);
  const days = monthDays(month);
  const intakeOf = (d: ISODate) => dayIntake(d, data.foods, data.settings, data.dinners, data.intakes);
  const weightOf = (d: ISODate) => data.weights.find((w) => w.date === d)?.kg ?? null;

  // 월 요약
  const logged = days.map(intakeOf).filter((x): x is DayIntake => x !== null);
  const avgPct = logged.length ? logged.reduce((s, x) => s + x.pct, 0) / logged.length : null;
  const monthWeights = data.weights.filter((w) => w.date.startsWith(month.slice(0, 7)));
  const wChange = monthWeights.length >= 2 ? monthWeights[monthWeights.length - 1].kg - monthWeights[0].kg : null;
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
        <div className="cal" role="grid" aria-label={`${y}년 ${m}월 기록 달력`}>
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
        <Stat label="기록한 날" value={`${logged.length}일`} sub={avgPct === null ? undefined : `평균 ${Math.round(avgPct * 100)}% 먹음`} />
        <Stat
          label="이달 체중 변화"
          value={wChange === null ? '기록 2개 이상 필요' : `${wChange >= 0 ? '+' : ''}${formatNum(wChange, 1)}kg`}
          tone={wChange === null ? undefined : wChange > 0 ? 'ok' : 'warn'}
        />
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
  const log = data.intakes.find((l) => l.date === date);
  const choice: DinnerChoice = data.dinners.find((d) => d.date === date)?.choice ?? 'meat';
  const plan = dailyNutrition(data.foods, data.settings.meals, data.settings.dinner[choice]);
  const names = plan.byMeal.map((m) => m.name);
  const label = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${WEEK[dow(date)]})${date === data.today ? ' · 오늘' : ''}`;

  return (
    <Card
      title={label}
      action={<button className="btn primary" onClick={() => markAllEaten(db, date, names)}>전부 다 먹음</button>}
    >
      <Stat
        label="먹은 칼로리"
        value={intake ? `${formatNum(intake.kcal)} / ${formatNum(data.settings.kcalTarget)} kcal` : '체크 전'}
        sub={intake ? `${Math.round(intake.pct * 100)}% · ${GRADE_LABEL[intake.grade]}` : '끼니마다 먹은 만큼 눌러 주세요'}
        tone={intake ? (intake.grade === 'good' ? 'ok' : 'warn') : undefined}
      />
      {intake && <Bar value={intake.kcal} max={data.settings.kcalTarget} label="그날 칼로리 목표 대비" />}
      {intake && (
        <Stat
          label="먹은 단백질"
          value={`${formatNum(intake.protein, 1)} g`}
          sub={`목표 ${data.settings.proteinTarget[0]}~${data.settings.proteinTarget[1]}g`}
          tone={intake.protein >= data.settings.proteinTarget[0] ? 'ok' : 'warn'}
        />
      )}

      {plan.byMeal.map((m) => {
        const cur = log?.meals[m.name];
        return (
          <div key={m.name} className="meal-check">
            <div className="row">
              <strong>{m.name}</strong>
              <span className="muted">{formatNum(m.kcal)}kcal · P {formatNum(m.protein, 1)}g</span>
            </div>
            <div className="seg" role="group" aria-label={`${m.name} 먹은 양`}>
              {STATUSES.map((s) => (
                <button key={s} aria-pressed={cur === s} onClick={() => setMealStatus(db, date, m.name, cur === s ? null : s)}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {m.name === '저녁' && (
              <div className="seg sub" role="group" aria-label="저녁 반찬">
                {DINNER.map((d) => (
                  <button key={d.id} aria-pressed={choice === d.id} onClick={() => setDinner(db, date, d.id)}>{d.label}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 12 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>그날 체중(kg)</span>
          <input inputMode="decimal" value={kg} onChange={(e) => { setKg(e.target.value); setSaved(false); }} placeholder="kg" />
        </label>
        <button
          className="btn primary"
          style={{ alignSelf: 'flex-end' }}
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
          <button className="btn" style={{ alignSelf: 'flex-end' }} aria-label="그날 체중 지우기" onClick={() => { deleteWeight(db, date); setKg(''); }}>
            지우기
          </button>
        )}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {saved && !err && <p className="ok" role="status">저장했어요.</p>}
      <p className="muted">체중은 아침에 화장실 다녀온 뒤 같은 조건으로 재면 추세가 정확해져요.</p>
    </Card>
  );
}

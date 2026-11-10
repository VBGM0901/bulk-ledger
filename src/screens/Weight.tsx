import { useState } from 'react';
import { Card, Stat } from '../components/ui';
import { addDays } from '../domain/dates';
import { formatNum } from '../domain/money';
import { forecastDate, goalWeightOn, movingAverage } from '../domain/weight';
import type { AppData } from '../state/useAppData';

const RANGES = [28, 56, 91] as const;
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = { 28: '4주', 56: '8주', 91: '3달' };

/** 체중 추세 그래프 + "더 먹을지" 제안. 기록 화면 아래에 붙는다. */
export function WeightTrend({ data }: { data: AppData }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(28);
  const goal = data.settings.weightGoal;
  const avg = movingAverage(data.weights, data.today);
  const { advice } = data;
  const rate = advice.rate;
  const forecast = forecastDate(data.weights, goal, data.today);

  const n = range;
  const days = Array.from({ length: n }, (_, i) => addDays(data.today, i - (n - 1)));
  const pts = days.map((d) => movingAverage(data.weights, d));
  const raw = days.map((d) => data.weights.find((w) => w.date === d)?.kg ?? null);
  const goalPts = goal ? days.map((d) => goalWeightOn(goal, d)) : [];
  const ys = [...pts.filter((p): p is number => p !== null), ...raw.filter((p): p is number => p !== null), ...goalPts];
  const lo = ys.length ? Math.min(...ys) - 0.5 : 0;
  const hi = ys.length ? Math.max(...ys) + 0.5 : 1;
  const x = (i: number) => (i / (n - 1)) * 300;
  const y = (v: number) => 95 - ((v - lo) / (hi - lo)) * 90;
  const line = (vals: (number | null)[]) =>
    vals.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');

  const tone = advice.kind === 'on-track' ? 'ok' : advice.kind === 'need-data' ? undefined : 'warn';

  return (
    <>
      <Card title="그래서 더 먹어야 할까?">
        <p className={`advice ${tone ?? ''}`}><strong>{advice.title}</strong></p>
        <p className="muted" style={{ marginTop: 0 }}>{advice.detail}</p>
        <Stat
          label="최근 1주 변화 (7일 평균)"
          value={rate === null ? '데이터 부족' : `${rate >= 0 ? '+' : ''}${formatNum(rate, 2)}kg`}
          tone={tone}
        />
        {goal && (
          <Stat
            label={`${goal.targetKg}kg 도달 예상`}
            value={forecast ? `${Number(forecast.slice(5, 7))}월 ${Number(forecast.slice(8))}일쯤` : '아직 계산 못 해요'}
            sub={forecast ? `목표일 ${goal.endDate.slice(5).replace('-', '/')} · 지금 속도로 쭉 가면` : '체중이 늘기 시작하면 보여요'}
            tone={forecast ? (forecast <= goal.endDate ? 'ok' : 'warn') : undefined}
          />
        )}
        {advice.targetRate !== null && <Stat label="목표 속도" value={`주 ${advice.targetRate >= 0 ? '+' : ''}${formatNum(advice.targetRate, 2)}kg`} />}
        {data.recentIntake && (
          <Stat label="최근 7일 식사" value={`평균 ${Math.round(data.recentIntake.pct * 100)}%`} sub={`${data.recentIntake.logged}일 기록`} />
        )}
        <p className="muted small-note">참고용 계산이에요. 몸 상태가 안 좋거나 급하게 변하면 전문가와 상담하세요.</p>
      </Card>

      <Card title="체중 추세">
        <div className="seg" role="group" aria-label="그래프 기간">
          {RANGES.map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
        <Stat label="지금 (7일 평균)" value={avg === null ? '기록 없음' : `${formatNum(avg, 1)}kg`} />
        {goal && (
          <Stat label="오늘 목표선" value={`${formatNum(goalWeightOn(goal, data.today), 1)}kg`} sub={`${goal.startKg}→${goal.targetKg}kg · ${goal.endDate}까지`} />
        )}
        {ys.length > 0 && (
          <svg viewBox="0 0 300 100" width="100%" height="140" role="img" aria-label={`최근 ${RANGE_LABEL[range]} 체중과 목표선`}>
            {goal && <polyline points={line(goalPts)} fill="none" stroke="var(--molu-muted)" strokeDasharray="4 4" strokeWidth="1.5" />}
            {raw.map((v, i) => (v === null ? null : <circle key={`r${i}`} cx={x(i)} cy={y(v)} r="2" fill="var(--molu-muted)" opacity=".55" />))}
            <polyline points={line(pts)} fill="none" stroke="var(--molu-accent)" strokeWidth="2.5" strokeLinejoin="round" />
            {pts.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--molu-accent)" />))}
          </svg>
        )}
        {ys.length > 0 ? (
          <p className="muted">파란 선: 7일 평균 · 회색 점: 그날 체중 · 점선: 목표선</p>
        ) : (
          <p className="muted">달력에서 날짜를 눌러 체중을 기록하면 그래프가 생겨요.</p>
        )}
      </Card>
    </>
  );
}

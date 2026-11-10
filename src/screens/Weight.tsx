import { Card, Stat } from '../components/ui';
import { addDays } from '../domain/dates';
import { formatNum } from '../domain/money';
import { forecastDate, goalWeightOn, movingAverage } from '../domain/weight';
import type { AppData } from '../state/useAppData';

const DAYS = 56; // 8주

/** 체중 한 카드: 제안 + 지금 + 도달 예상 + 8주 그래프 */
export function WeightTrend({ data }: { data: AppData }) {
  const goal = data.settings.weightGoal;
  const avg = movingAverage(data.weights, data.today);
  const { advice } = data;
  const forecast = forecastDate(data.weights, goal, data.today);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(data.today, i - (DAYS - 1)));
  const pts = days.map((d) => movingAverage(data.weights, d));
  const raw = days.map((d) => data.weights.find((w) => w.date === d)?.kg ?? null);
  const goalPts = goal ? days.map((d) => goalWeightOn(goal, d)) : [];
  const ys = [...pts.filter((p): p is number => p !== null), ...raw.filter((p): p is number => p !== null), ...goalPts];
  const lo = ys.length ? Math.min(...ys) - 0.5 : 0;
  const hi = ys.length ? Math.max(...ys) + 0.5 : 1;
  const x = (i: number) => (i / (DAYS - 1)) * 300;
  const y = (v: number) => 95 - ((v - lo) / (hi - lo)) * 90;
  const line = (vals: (number | null)[]) =>
    vals.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const tone = advice.kind === 'on-track' ? 'ok' : advice.kind === 'need-data' ? undefined : 'warn';

  return (
    <Card title="체중">
      <p className={`advice ${tone ?? ''}`}><strong>{advice.title}</strong></p>
      <Stat
        label="지금 (7일 평균)"
        value={avg === null ? '기록 없음' : `${formatNum(avg, 1)}kg`}
        sub={advice.rate === null ? undefined : `1주 ${advice.rate >= 0 ? '+' : ''}${formatNum(advice.rate, 1)}kg`}
      />
      {goal && (
        <Stat
          label={`${goal.targetKg}kg 도달 예상`}
          value={forecast ? `${Number(forecast.slice(5, 7))}월 ${Number(forecast.slice(8))}일쯤` : '–'}
          tone={forecast ? (forecast <= goal.endDate ? 'ok' : 'warn') : undefined}
        />
      )}
      {ys.length > 0 && (
        <svg viewBox="0 0 300 100" width="100%" height="130" role="img" aria-label="최근 8주 체중과 목표선">
          {goal && <polyline points={line(goalPts)} fill="none" stroke="var(--molu-muted)" strokeDasharray="4 4" strokeWidth="1.5" />}
          {raw.map((v, i) => (v === null ? null : <circle key={`r${i}`} cx={x(i)} cy={y(v)} r="2" fill="var(--molu-muted)" opacity=".55" />))}
          <polyline points={line(pts)} fill="none" stroke="var(--molu-accent)" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
      <p className="muted small-note">파란 선 7일 평균 · 점선 목표 · 참고용 계산이에요</p>
    </Card>
  );
}

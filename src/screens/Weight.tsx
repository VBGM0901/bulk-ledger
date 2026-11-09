import { useState } from 'react';
import { Card, Field, Stat } from '../components/ui';
import { logWeight } from '../db/actions';
import { db } from '../db/db';
import { addDays } from '../domain/dates';
import { formatNum } from '../domain/money';
import { goalWeightOn, movingAverage, weeklyRate } from '../domain/weight';
import type { AppData } from '../state/useAppData';

export default function Weight({ data }: { data: AppData }) {
  const [kg, setKg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const goal = data.settings.weightGoal;
  const avg = movingAverage(data.weights, data.today);
  const rate = weeklyRate(data.weights, data.today);
  const todayLog = data.weights.find((w) => w.date === data.today);

  const days = Array.from({ length: 28 }, (_, i) => addDays(data.today, i - 27));
  const pts = days.map((d) => movingAverage(data.weights, d));
  const goalPts = goal ? days.map((d) => goalWeightOn(goal, d)) : [];
  const ys = [...pts.filter((p): p is number => p !== null), ...goalPts];
  const lo = ys.length ? Math.min(...ys) - 0.5 : 0;
  const hi = ys.length ? Math.max(...ys) + 0.5 : 1;
  const y = (v: number) => 95 - ((v - lo) / (hi - lo)) * 90;
  const line = (vals: (number | null)[]) =>
    vals.map((v, i) => (v === null ? null : `${((i / 27) * 300).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');

  const rateTone = rate === null ? undefined : rate > 0.75 ? 'warn' : rate >= 0.2 ? 'ok' : 'warn';
  const rateNote =
    rate === null ? '7일 이상 기록하면 보여요'
      : rate > 0.75 ? '너무 빨라요 — 지방 위주일 수 있어요'
        : rate >= 0.2 ? '건강한 속도예요'
          : '거의 안 늘었어요 — 계획대로 다 먹고 있는지 확인해 보세요';

  return (
    <>
      <Card title="오늘 체중">
        {todayLog && <p className="muted">오늘 기록: {formatNum(todayLog.kg, 1)}kg (다시 저장하면 바뀌어요)</p>}
        <Field label="오늘 체중(kg)">
          <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="kg" />
        </Field>
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await logWeight(db, data.today, Number(kg));
              setErr(null);
              setKg('');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          저장
        </button>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="muted">아침에 화장실 다녀온 뒤 같은 조건으로 재면 추세가 정확해져요.</p>
      </Card>

      <Card title="추세 (7일 평균)">
        <Stat label="지금" value={avg === null ? '기록 없음' : `${formatNum(avg, 1)}kg`} />
        <Stat label="최근 1주 변화" value={rate === null ? '데이터 부족' : `${rate >= 0 ? '+' : ''}${formatNum(rate, 2)}kg`} sub={rateNote} tone={rateTone} />
        {goal && (
          <Stat label="오늘 목표선" value={`목표선 ${formatNum(goalWeightOn(goal, data.today), 1)}kg`} sub={`${goal.startKg}→${goal.targetKg}kg · ${goal.endDate}까지`} />
        )}
        {ys.length > 0 && (
          <svg viewBox="0 0 300 100" width="100%" height="130" role="img" aria-label="최근 4주 체중 7일 평균과 목표선">
            {goal && <polyline points={line(goalPts)} fill="none" stroke="var(--molu-muted)" strokeDasharray="4 4" strokeWidth="1.5" />}
            <polyline points={line(pts)} fill="none" stroke="var(--molu-accent)" strokeWidth="2.5" strokeLinejoin="round" />
            {pts.map((v, i) => (v === null ? null : <circle key={i} cx={(i / 27) * 300} cy={y(v)} r="2.5" fill="var(--molu-accent)" />))}
          </svg>
        )}
        {ys.length > 0 && <p className="muted">파란 선: 7일 평균 · 점선: 목표선 · 최근 4주</p>}
      </Card>

      <Card title="최근 기록">
        {data.weights.length === 0 && <p className="muted">아직 없어요.</p>}
        {[...data.weights].reverse().slice(0, 14).map((w) => (
          <Stat key={w.date} label={w.date} value={`${formatNum(w.kg, 1)}kg`} />
        ))}
      </Card>
    </>
  );
}

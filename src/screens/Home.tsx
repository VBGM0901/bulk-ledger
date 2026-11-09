import type { Screen } from '../App';
import { Bar, Card, Notice, Stat } from '../components/ui';
import { setDinner } from '../db/actions';
import { db } from '../db/db';
import { depletionDate } from '../domain/consumption';
import { addDays } from '../domain/dates';
import { formatKRW, formatNum } from '../domain/money';
import type { DinnerChoice } from '../domain/types';
import { goalWeightOn, movingAverage } from '../domain/weight';
import type { AppData } from '../state/useAppData';

const DINNER: { id: DinnerChoice; label: string }[] = [
  { id: 'meat', label: '고기 있음' },
  { id: 'none', label: '고기 없음' },
  { id: 'less', label: '덜 먹음' },
];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Home({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const { summary: s, nutrition: n, settings, period } = data;
  const avg = movingAverage(data.weights, data.today);
  const goal = settings.weightGoal;
  const soonLimit = addDays(data.today, 3);
  const tracked = new Set(data.stockEvents.map((e) => e.foodId));
  const planned = data.foods.filter((f) => !f.free && (data.dailyUse[f.id] ?? 0) > 0);
  const untracked = planned.filter((f) => !tracked.has(f.id));
  const soon = planned
    .filter((f) => tracked.has(f.id))
    .map((f) => ({ f, date: depletionDate(data.stock[f.id] ?? 0, data.dailyUse[f.id], data.today) }))
    .filter((x): x is { f: typeof x.f; date: string } => x.date !== null && x.date <= soonLimit);
  const pct = (v: number) => (s.income > 0 ? `${Math.round((v / s.income) * 100)}%` : undefined);

  return (
    <>
      <section className="hero">
        <div className="label">{md(period.start)} ~ {md(period.end)} 남은 예산</div>
        <div className="big num">{formatKRW(s.remaining)}</div>
        <div className="label">
          하루 사용 가능 <span className="num">{formatKRW(s.dailyAllowance)}</span> · {s.daysLeft}일 남음
        </div>
      </section>

      {data.needsSetup && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          수입·고정비가 아직 없어요. 눌러서 설정에서 개인 데이터 파일을 불러오거나 직접 입력하세요.
        </button>
      )}
      {s.missing.length > 0 && <Notice tone="warn">미입력: {s.missing.join(', ')} — 설정에서 입력하세요.</Notice>}
      {s.overBudget && !data.needsSetup && <Notice tone="err">계획 지출이 수입보다 {formatKRW(-s.remaining)} 많아요.</Notice>}
      {data.plan.missing.length > 0 && <Notice tone="warn">가격이 없는 식품이 있어 식단비가 덜 잡혔어요: {data.plan.missing.join(', ')}</Notice>}
      {data.backupStale && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          백업한 지 7일이 넘었어요. 눌러서 백업하기
        </button>
      )}

      <Card title="오늘 먹을 것 (계획)" action={<button className="btn" onClick={() => navigate('diet')}>식단</button>}>
        <Stat
          label="칼로리"
          value={`${formatNum(n.kcal)} / ${formatNum(settings.kcalTarget)} kcal`}
          tone={n.kcal >= settings.kcalTarget * 0.97 ? 'ok' : 'warn'}
        />
        <Bar value={n.kcal} max={settings.kcalTarget} label="칼로리 목표 대비" />
        <Stat
          label="단백질"
          value={`${formatNum(n.protein, 1)} g`}
          sub={`목표 ${settings.proteinTarget[0]}~${settings.proteinTarget[1]}g`}
          tone={n.protein >= settings.proteinTarget[0] ? 'ok' : 'warn'}
        />
        <p className="muted" style={{ margin: '10px 0 6px' }}>오늘 저녁</p>
        <div className="seg">
          {DINNER.map((d) => (
            <button key={d.id} aria-pressed={data.dinnerToday === d.id} onClick={() => setDinner(db, data.today, d.id)}>
              {d.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="이번 달 돈" action={<button className="btn" onClick={() => navigate('spend')}>지출</button>}>
        <Stat label="수입" value={formatKRW(s.income)} />
        <Stat label="고정·정기" value={formatKRW(s.fixed)} sub={pct(s.fixed)} />
        <Stat label="식단 계획" value={formatKRW(s.foodPlan)} sub={`${pct(s.foodPlan) ?? ''} · 실제 구매 ${formatKRW(s.foodSpent)}`} />
        <Stat label="식단 외 지출" value={formatKRW(s.otherSpent)} />
        <Bar value={s.fixed + s.foodPlan + s.otherSpent} max={Math.max(1, s.income)} label="수입 대비 지출" />
      </Card>

      <Card title="체중" action={<button className="btn" onClick={() => navigate('weight')}>기록</button>}>
        <Stat label="7일 평균" value={avg === null ? '기록 없음' : `${formatNum(avg, 1)} kg`} />
        {goal && <Stat label="오늘 목표선" value={`${formatNum(goalWeightOn(goal, data.today), 1)} kg`} sub={`최종 ${goal.targetKg}kg`} />}
      </Card>

      {untracked.length > 0 && (
        <button className="card muted" style={{ textAlign: 'left' }} onClick={() => navigate('diet')}>
          재고 기록이 없는 식품 {untracked.length}개 — 식단 화면에서 "지금 재고 맞추기"를 한 번 입력하면 장보기 알림이 정확해져요.
        </button>
      )}
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

import { Bar, Card, Stat } from '../components/ui';
import { summarizeBudget } from '../domain/budget';
import { addDays, budgetPeriod } from '../domain/dates';
import { planFoodPurchases } from '../domain/foodPlan';
import { formatKRW, formatNum } from '../domain/money';
import { dayIntake } from '../domain/intake';
import type { AppData } from '../state/useAppData';

export default function Report({ data }: { data: AppData }) {
  const prev = budgetPeriod(addDays(data.period.start, -1), data.settings.payday);
  const prevPlan = planFoodPurchases(data.foods, data.settings.meals, prev.days);
  const prevSum = summarizeBudget({
    incomes: data.incomes, recurring: data.recurring, foodPlan: prevPlan.total, expenses: data.expenses, period: prev, today: prev.end,
  });
  const s = data.summary;
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(([, v]) => v));
  // 이번 예산월 식사·체중 (오늘까지)
  const days: string[] = [];
  for (let d = data.period.start; d <= data.today && d <= data.period.end; d = addDays(d, 1)) days.push(d);
  const logged = days.map((d) => dayIntake(d, data.foods, data.settings, data.dinners, data.intakes)).filter((x) => x !== null);
  const avgPct = logged.length ? logged.reduce((t, x) => t + x.pct, 0) / logged.length : null;
  const avgProtein = logged.length ? logged.reduce((t, x) => t + x.protein, 0) / logged.length : null;
  const good = logged.filter((x) => x.grade === 'good').length;
  const ws = data.weights.filter((w) => w.date >= data.period.start && w.date <= data.period.end);
  const wChange = ws.length >= 2 ? ws[ws.length - 1].kg - ws[0].kg : null;

  return (
    <>
      <Card title={`${data.period.start} ~ ${data.period.end}`}>
        <Stat label="수입" value={formatKRW(s.income)} />
        <Stat label="고정·정기" value={formatKRW(s.fixed)} />
        <Stat
          label="식단: 계획 vs 실제 구매"
          value={`${formatKRW(s.foodPlan)} / ${formatKRW(s.foodSpent)}`}
          sub={s.foodSpent < s.foodPlan * 0.6 && s.daysLeft < data.period.days / 3 ? '계획보다 많이 덜 샀어요 — 덜 먹고 있을 수 있어요' : undefined}
        />
        <Stat label="식단 외 지출" value={formatKRW(s.otherSpent)} />
        <Stat label="남은 예산" value={formatKRW(s.remaining)} tone={s.remaining < 0 ? 'err' : undefined} />
      </Card>
      <Card title="이번 달 식사·체중">
        <Stat label="기록한 날" value={`${logged.length}일 / ${days.length}일`} sub={logged.length ? `95% 이상 먹은 날 ${good}일` : undefined} />
        <Stat label="평균 칼로리 달성" value={avgPct === null ? '기록 없음' : `${Math.round(avgPct * 100)}%`} tone={avgPct === null ? undefined : avgPct >= 0.95 ? 'ok' : 'warn'} />
        <Stat label="평균 단백질" value={avgProtein === null ? '기록 없음' : `${formatNum(avgProtein, 1)}g`} sub={`목표 ${data.settings.proteinTarget[0]}~${data.settings.proteinTarget[1]}g`} />
        <Stat label="체중 변화" value={wChange === null ? '기록 2개 이상 필요' : `${wChange >= 0 ? '+' : ''}${formatNum(wChange, 1)}kg`} tone={wChange === null ? undefined : wChange > 0 ? 'ok' : 'warn'} />
      </Card>
      <Card title={`지난 예산월 (${prev.start} ~ ${prev.end})`}>
        <Stat label="식단 실제 구매" value={formatKRW(prevSum.foodSpent)} />
        <Stat label="식단 외 지출" value={formatKRW(prevSum.otherSpent)} sub={`이번 달 ${formatKRW(s.otherSpent)}`} />
      </Card>
      <Card title="카테고리별 (이번 달)">
        {cats.length === 0 && <p className="muted">이번 달 기록이 없어요.</p>}
        {cats.map(([c, v]) => (
          <div key={c}>
            <Stat label={c} value={formatKRW(v)} />
            <Bar value={v} max={max} label={`${c} 지출`} />
          </div>
        ))}
      </Card>
    </>
  );
}

import { Bar, Card, Stat } from '../components/ui';
import { summarizeBudget } from '../domain/budget';
import { addDays, budgetPeriod } from '../domain/dates';
import { planFoodPurchases } from '../domain/foodPlan';
import { formatKRW } from '../domain/money';
import { describeChoices } from '../domain/optimizer';
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
  const consumption = data.plan.lines.reduce((t, l) => t + (l.consumptionCost ?? 0), 0);

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
        <Stat label="식단 소비 원가(먹는 만큼)" value={formatKRW(consumption)} sub="포장 단위 구매비와 달라요" />
        <Stat label="식단 외 지출" value={formatKRW(s.otherSpent)} />
        <Stat label="남은 예산" value={formatKRW(s.remaining)} tone={s.remaining < 0 ? 'err' : undefined} />
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
      <Card title="식단 계획 구매 조합">
        {data.plan.lines.map((l) => {
          const f = data.foods.find((x) => x.id === l.foodId)!;
          return (
            <Stat
              key={l.foodId}
              label={`${f.name} (${l.needed}${f.unit})`}
              value={l.result ? formatKRW(l.result.cost) : '미입력'}
              sub={l.result ? describeChoices(l.result.choices) : undefined}
            />
          );
        })}
        <Stat label="합계" value={formatKRW(data.plan.total)} />
      </Card>
    </>
  );
}

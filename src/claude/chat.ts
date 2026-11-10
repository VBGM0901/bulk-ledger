import { dinnerLabel } from '../domain/display';
import { describeChoices } from '../domain/optimizer';
import { formatKRW, formatNum } from '../domain/money';
import { costEfficiency } from '../domain/nutrition';
import { addDays } from '../domain/dates';
import { dayIntake } from '../domain/intake';
import { movingAverage, weeklyRate } from '../domain/weight';
import type { AppData } from '../state/useAppData';


/** Claude에게 넘기는 앱 데이터 요약. API 키 등 비밀 값은 넣지 않는다. */
export function buildChatContext(d: AppData): string {
  const s = d.summary;
  const foods = d.foods.map((f) => {
    const e = costEfficiency(f);
    const m = d.measured[f.id];
    const price = f.free
      ? '0원(집)'
      : e.perKcal === null
        ? '가격 미입력'
        : `${formatNum(e.perKcal, 1)}원/kcal, ${e.perProteinG === null ? '-' : formatNum(e.perProteinG)}원/단백질g`;
    return `- ${f.name} [${f.id}]: 1${f.unit}당 ${f.perUnit.kcal}kcal·P${f.perUnit.protein}g, 하루 계획 ${d.dailyPlan[f.id] ?? 0}${f.unit}` +
      `${m === null ? '' : `, 실측 ${formatNum(m, 1)}${f.unit}/일`}, 재고 ${formatNum(d.stock[f.id] ?? 0, 1)}${f.unit}, ${price}` +
      `, 포장 ${f.packOptions.map((o) => `${o.label} ${formatKRW(o.price)}`).join(' / ') || '없음'}`;
  }).join('\n');
  const meals = d.nutrition.byMeal.map((m) => `${m.name} ${m.kcal}kcal·P${m.protein}g`).join(', ');
  const plan = d.plan.lines
    .map((l) => `${l.foodId} ${l.result ? `${describeChoices(l.result.choices)}=${formatKRW(l.result.cost)}` : '미입력'}`)
    .join(', ');
  const avg = movingAverage(d.weights, d.today);
  const rate = weeklyRate(d.weights, d.today);
  const g = d.settings.weightGoal;
  return [
    `오늘 ${d.today}. 예산월 ${d.period.start}~${d.period.end} (${d.period.days}일).`,
    `수입 ${formatKRW(s.income)}, 고정비 ${formatKRW(s.fixed)}, 식단 계획 구매비 ${formatKRW(s.foodPlan)}, 식단 실제 구매 ${formatKRW(s.foodSpent)}, 식단 외 지출 ${formatKRW(s.otherSpent)}.`,
    `남은 예산 ${formatKRW(s.remaining)}, 남은 ${s.daysLeft}일, 하루 사용 가능 ${formatKRW(s.dailyAllowance)}.${s.missing.length ? ` 미입력: ${s.missing.join(', ')}.` : ''}`,
    `카테고리별 이번 달 지출: ${Object.entries(s.byCategory).map(([k, v]) => `${k} ${formatKRW(v)}`).join(', ') || '없음'}.`,
    `목표 ${d.settings.kcalTarget}kcal, 단백질 ${d.settings.proteinTarget.join('~')}g. 오늘 계획 ${formatNum(d.nutrition.kcal)}kcal, 단백질 ${formatNum(d.nutrition.protein, 1)}g (저녁 집밥: ${dinnerLabel(d.dinnerToday)}). 끼니: ${meals}.`,
    `체중 7일 평균 ${avg === null ? '기록 없음' : `${formatNum(avg, 1)}kg`}, 최근 1주 변화 ${rate === null ? '데이터 부족' : `${formatNum(rate, 2)}kg`}` +
      `${g ? `, 목표 ${g.startKg}→${g.targetKg}kg (${g.startDate}~${g.endDate})` : ''}.`,
    d.settings.profileNote ? `사용자 메모: ${d.settings.profileNote}` : '',
    `지금 제안: ${d.advice.title}.`,
    `최근 14일 기록 (날짜: 먹은 kcal/목표 %, 단백질, 체중, 추가 음식):`,
    recentLog(d) || '- 기록 없음',
    `이번 달 계획 구매 조합: ${plan}.`,
    '식품:',
    foods,
  ].filter(Boolean).join('\n');
}

function recentLog(d: AppData): string {
  const lines: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(d.today, -i);
    const it = dayIntake(date, d.foods, d.settings, d.dinners, d.intakes);
    const w = d.weights.find((x) => x.date === date);
    if (!it && !w) continue;
    const extras = d.intakes.find((l) => l.date === date)?.extras ?? [];
    const parts = [
      it ? `${formatNum(it.kcal)}kcal(${Math.round(it.pct * 100)}%), P${formatNum(it.protein, 1)}g, 끼니 ${it.checked}/${it.total} 체크` : '식사 기록 없음',
      w ? `체중 ${formatNum(w.kg, 1)}kg` : '',
      extras.length ? `추가: ${extras.map((e) => `${e.name} ${e.kcal}kcal`).join(', ')}` : '',
    ].filter(Boolean);
    lines.push(`- ${date}: ${parts.join(' · ')}`);
  }
  return lines.join('\n');
}

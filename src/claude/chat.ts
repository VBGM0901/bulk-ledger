import { describeChoices } from '../domain/optimizer';
import { formatKRW, formatNum } from '../domain/money';
import { costEfficiency } from '../domain/nutrition';
import { movingAverage, weeklyRate } from '../domain/weight';
import type { AppData } from '../state/useAppData';
import { callClaude, MODELS } from './client';

const DINNER_LABEL = { meat: '고기 반찬 있음', none: '고기 없음', less: '덜 먹음' } as const;

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
    `목표 ${d.settings.kcalTarget}kcal, 단백질 ${d.settings.proteinTarget.join('~')}g. 오늘 계획 ${formatNum(d.nutrition.kcal)}kcal, 단백질 ${formatNum(d.nutrition.protein, 1)}g (저녁: ${DINNER_LABEL[d.dinnerToday]}). 끼니: ${meals}.`,
    `체중 7일 평균 ${avg === null ? '기록 없음' : `${formatNum(avg, 1)}kg`}, 최근 1주 변화 ${rate === null ? '데이터 부족' : `${formatNum(rate, 2)}kg`}` +
      `${g ? `, 목표 ${g.startKg}→${g.targetKg}kg (${g.startDate}~${g.endDate})` : ''}.`,
    d.settings.profileNote ? `사용자 메모: ${d.settings.profileNote}` : '',
    `이번 달 계획 구매 조합: ${plan}.`,
    '식품:',
    foods,
  ].filter(Boolean).join('\n');
}

const SYSTEM = [
  '너는 사용자의 개인 증량·가계부 코치다. 사용자는 건강하게 체중을 늘리는 중이다.',
  '존댓말로, 짧고 구체적으로 답한다. 숫자는 아래 데이터만 근거로 계산하고, 데이터에 없으면 모른다고 말한다.',
  '식단을 늘리자고 제안할 때는 kcal·단백질 변화와 월 비용 변화를 함께 말한다. 의료 진단은 하지 않는다.',
].join('\n');

export function askClaude(d: AppData, history: { role: 'user' | 'assistant'; content: string }[], fetchImpl?: typeof fetch) {
  return callClaude({
    apiKey: d.settings.apiKey,
    model: MODELS.chat,
    maxTokens: 1200,
    fetchImpl,
    system: `${SYSTEM}\n\n[앱 데이터]\n${buildChatContext(d)}`,
    messages: history,
  });
}

import { deleteExpense, recordExpense, recordPurchase } from '../db/actions';
import type { AppDB } from '../db/db';
import { HOME_KEY } from '../domain/intake';
import { formatKRW, formatNum } from '../domain/money';
import { EXPENSE_CATEGORIES, type ChatAction, type ExpenseCategory, type IntakeLog, type ISODate, type PurchaseLine } from '../domain/types';
import type { AppData } from '../state/useAppData';
import { buildChatContext } from './chat';
import { callClaudeRaw, ClaudeError, MODELS, type ApiBlock, type ApiMessage, type ApiTool } from './client';

/** 대화방에서 Claude가 쓸 수 있는 기록 도구. 실행 결과는 되돌리기 정보와 함께 남는다. */
export function buildTools(d: AppData): ApiTool[] {
  const foodIds = d.foods.map((f) => f.id);
  const mealNames = d.settings.meals.map((m) => m.name);
  const date = { type: 'string', description: 'YYYY-MM-DD. "오늘"이면 오늘 날짜, "어제"면 하루 전.' };
  const obj = (properties: Record<string, unknown>) => ({
    type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
  });
  return [
    {
      name: 'record_eaten',
      description:
        '한 끼니에 실제로 먹은 음식과 양을 기록한다. 그 끼니에서 먹은 것만 넣는다(안 먹은 계획 음식은 빼면 0으로 기록됨). ' +
        '"아침에 요거트만 먹었어" → 아침 foods=[yogurt 1]. 저녁 집밥은 home에 0~1 비율(다 먹음 1, 반 0.5, 안 먹음 0), 저녁이 아니면 0.',
      strict: true,
      input_schema: obj({
        date,
        meal: { type: 'string', enum: mealNames },
        foods: { type: 'array', items: obj({ foodId: { type: 'string', enum: foodIds }, qty: { type: 'number', description: '식품 단위 기준 양' } }) },
        home: { type: 'number', description: '저녁 집밥 비율 0~1. 저녁이 아니면 0.' },
      }),
    },
    {
      name: 'mark_meals_all_eaten',
      description: '말한 끼니들을 계획대로 전부 먹은 것으로 기록한다. "아침 점심 다 먹었어", "오늘 다 먹었어"(모든 끼니).',
      strict: true,
      input_schema: obj({ date, meals: { type: 'array', items: { type: 'string', enum: mealNames } } }),
    },
    {
      name: 'record_extra_food',
      description: '계획에 없던 음식(편의점·외식 등)을 그날 먹은 것에 더한다. 칼로리·단백질은 모르면 일반적인 값으로 추정하고 답에서 추정이라고 말한다.',
      strict: true,
      input_schema: obj({ date, name: { type: 'string' }, kcal: { type: 'number' }, protein: { type: 'number' } }),
    },
    {
      name: 'record_food_purchase',
      description:
        '앱에 등록된 식품(쿠팡 등)을 산 것을 기록한다. 금액은 등록된 팩 가격으로 자동 계산되고 재고도 늘어난다. ' +
        'packLabel은 식품 목록의 포장 이름과 정확히 같아야 한다. 가격이 다르면 record_expense를 대신 쓴다.',
      strict: true,
      input_schema: obj({
        date,
        items: { type: 'array', items: obj({ foodId: { type: 'string', enum: foodIds }, packLabel: { type: 'string' }, packs: { type: 'integer' } }) },
      }),
    },
    {
      name: 'record_expense',
      description: '지출을 기록한다 (등록 식품이 아닌 것, 외식, 생활용품 등). 금액은 원 단위 정수.',
      strict: true,
      input_schema: obj({
        date,
        amount: { type: 'integer' },
        category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
        memo: { type: 'string', description: '무엇을 샀는지 짧게' },
      }),
    },
    {
      name: 'log_weight',
      description: '체중을 기록한다 (kg).',
      strict: true,
      input_schema: obj({ date, kg: { type: 'number' } }),
    },
  ];
}

function checkDate(v: unknown, today: ISODate): ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('날짜 형식이 잘못됐어요.');
  if (v > today) throw new Error('미래 날짜에는 기록할 수 없어요.');
  return v;
}

async function snapshotIntake(db: AppDB, date: ISODate): Promise<IntakeLog | null> {
  return (await db.intakes.get(date)) ?? null;
}

/** 도구 하나 실행. 성공하면 사용자에게 보일 요약과 되돌리기 정보를 돌려준다. */
export async function runTool(db: AppDB, d: AppData, name: string, input: Record<string, unknown>): Promise<ChatAction> {
  const foodName = (id: string) => d.foods.find((f) => f.id === id)?.name ?? id;
  const unit = (id: string) => d.foods.find((f) => f.id === id)?.unit ?? '';
  switch (name) {
    case 'record_eaten': {
      const date = checkDate(input.date, d.today);
      const meal = String(input.meal);
      if (!d.settings.meals.some((m) => m.name === meal)) throw new Error(`없는 끼니예요: ${meal}`);
      const foods = (input.foods as { foodId: string; qty: number }[]) ?? [];
      const items: Record<string, number> = {};
      for (const m of d.settings.meals.find((x) => x.name === meal)!.items) items[m.foodId] = 0;
      for (const f of foods) {
        if (!d.foods.some((x) => x.id === f.foodId)) throw new Error(`없는 식품이에요: ${f.foodId}`);
        if (!(f.qty >= 0 && f.qty < 5000)) throw new Error('양을 확인해 주세요.');
        items[f.foodId] = (items[f.foodId] ?? 0) + f.qty;
      }
      if (meal === '저녁') items[HOME_KEY] = Math.min(1, Math.max(0, Number(input.home) || 0));
      const prev = await snapshotIntake(db, date);
      const next: IntakeLog = { ...(prev ?? { date, meals: {} }), date, items: { ...(prev?.items ?? {}), [meal]: items } };
      next.meals = { ...next.meals };
      delete next.meals[meal];
      await db.intakes.put(next);
      const eaten = foods.filter((f) => f.qty > 0).map((f) => `${foodName(f.foodId)} ${formatNum(f.qty, f.qty % 1 ? 1 : 0)}${unit(f.foodId)}`);
      if (meal === '저녁' && items[HOME_KEY] > 0) eaten.push(`집밥 ${items[HOME_KEY] === 1 ? '' : `${items[HOME_KEY]}인분`}`.trim());
      return { summary: `${date.slice(5)} ${meal}: ${eaten.join(', ') || '안 먹음'}`, undo: { kind: 'intake', date, prev } };
    }
    case 'mark_meals_all_eaten': {
      const date = checkDate(input.date, d.today);
      const meals = (input.meals as string[]).filter((m) => d.settings.meals.some((x) => x.name === m));
      if (meals.length === 0) throw new Error('끼니 이름을 확인해 주세요.');
      const prev = await snapshotIntake(db, date);
      const next: IntakeLog = { ...(prev ?? { date, meals: {} }), date, meals: { ...(prev?.meals ?? {}) } };
      const items = { ...(prev?.items ?? {}) };
      for (const m of meals) {
        next.meals[m] = 'all';
        delete items[m];
      }
      next.items = items;
      await db.intakes.put(next);
      return { summary: `${date.slice(5)} ${meals.join('·')} 다 먹음`, undo: { kind: 'intake', date, prev } };
    }
    case 'record_extra_food': {
      const date = checkDate(input.date, d.today);
      const kcal = Math.round(Number(input.kcal));
      const protein = Math.round(Number(input.protein) * 10) / 10;
      const nm = String(input.name ?? '').trim();
      if (!nm) throw new Error('음식 이름이 없어요.');
      if (!(kcal >= 0 && kcal < 5000) || !(protein >= 0 && protein < 300)) throw new Error('칼로리·단백질 값을 확인해 주세요.');
      const prev = await snapshotIntake(db, date);
      const next: IntakeLog = { ...(prev ?? { date, meals: {} }), date };
      next.extras = [...(prev?.extras ?? []), { id: crypto.randomUUID(), name: nm, kcal, protein }];
      await db.intakes.put(next);
      return { summary: `${date.slice(5)} 추가 음식: ${nm} ${kcal}kcal · P ${protein}g`, undo: { kind: 'intake', date, prev } };
    }
    case 'record_food_purchase': {
      const date = checkDate(input.date, d.today);
      const lines: PurchaseLine[] = [];
      for (const it of (input.items as { foodId: string; packLabel: string; packs: number }[]) ?? []) {
        const f = d.foods.find((x) => x.id === it.foodId);
        if (!f) throw new Error(`없는 식품이에요: ${it.foodId}`);
        const opt = f.packOptions.find((o) => o.label === it.packLabel);
        if (!opt) throw new Error(`${f.name}의 포장 이름은 다음 중 하나예요: ${f.packOptions.map((o) => o.label).join(', ')}`);
        if (!(Number.isInteger(it.packs) && it.packs > 0 && it.packs < 100)) throw new Error('팩 수를 확인해 주세요.');
        if (!(opt.price > 0)) throw new Error(`${f.name} ${opt.label} 가격이 없어요. record_expense로 금액을 직접 기록하세요.`);
        lines.push({ foodId: f.id, packLabel: opt.label, packs: it.packs, qtyAdded: opt.qty * it.packs, price: opt.price * it.packs });
      }
      const { expenseId } = await recordPurchase(db, { date, lines, source: 'purchase' });
      const total = lines.reduce((s, l) => s + l.price, 0);
      return {
        summary: `${date.slice(5)} 식단 구매 ${formatKRW(total)}: ${lines.map((l) => `${foodName(l.foodId)} ${l.packLabel}×${l.packs}`).join(', ')}`,
        undo: { kind: 'expense', expenseId },
      };
    }
    case 'record_expense': {
      const date = checkDate(input.date, d.today);
      const category = String(input.category) as ExpenseCategory;
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new Error('카테고리를 확인해 주세요.');
      const amount = Number(input.amount);
      const memo = String(input.memo ?? '');
      const expenseId = await recordExpense(db, { date, amount, category, memo, source: 'manual' });
      return { summary: `${date.slice(5)} 지출 ${formatKRW(amount)} · ${category}${memo ? ` · ${memo}` : ''}`, undo: { kind: 'expense', expenseId } };
    }
    case 'log_weight': {
      const date = checkDate(input.date, d.today);
      const kg = Math.round(Number(input.kg) * 10) / 10;
      if (!(kg > 20 && kg < 300)) throw new Error('체중 값을 확인해 주세요.');
      const prev = (await db.weights.get(date))?.kg ?? null;
      await db.weights.put({ date, kg });
      return { summary: `${date.slice(5)} 체중 ${formatNum(kg, 1)}kg`, undo: { kind: 'weight', date, prev } };
    }
    default:
      throw new Error(`모르는 도구예요: ${name}`);
  }
}

/** 되돌리기 */
export async function undoAction(db: AppDB, a: ChatAction): Promise<void> {
  const u = a.undo;
  if (u.kind === 'expense') await deleteExpense(db, u.expenseId);
  else if (u.kind === 'intake') {
    if (u.prev) await db.intakes.put(u.prev);
    else await db.intakes.delete(u.date);
  } else if (u.kind === 'weight') {
    if (u.prev === null) await db.weights.delete(u.date);
    else await db.weights.put({ date: u.date, kg: u.prev });
  }
}

const SYSTEM = [
  '너는 사용자의 개인 증량·가계부 비서다. 사용자는 건강하게 체중을 늘리는 중이다.',
  '사용자가 "~샀어", "~먹었어", "~원 나갔어", "몸무게 ~kg" 처럼 말하면 확인을 묻지 말고 바로 도구로 기록한다. 기록한 뒤 무엇을 기록했는지 한두 줄로 알려준다(사용자는 화면의 되돌리기 버튼으로 취소할 수 있다).',
  '먹은 것: 계획 끼니 안의 음식이면 record_eaten (그 끼니에서 먹은 것만), 끼니를 통째로 다 먹었으면 mark_meals_all_eaten, 계획에 없던 음식이면 record_extra_food.',
  '산 것: 등록 식품을 등록된 포장으로 샀으면 record_food_purchase, 그 외에는 record_expense. 금액이 애매하면 기록하지 말고 물어본다.',
  '날짜를 말하지 않으면 오늘로 기록한다. 사진(영수증·주문 캡처·음식 사진)이 오면 내용을 읽고 같은 규칙으로 기록한다.',
  '질문에는 존댓말로 짧고 구체적으로 답한다. 숫자는 아래 데이터만 근거로 계산하고, 없으면 모른다고 한다. 식단을 늘리자고 할 때는 kcal·단백질 변화와 월 비용 변화를 함께 말한다. 의료 진단은 하지 않는다.',
].join('\n');

export interface AgentResult { text: string; actions: ChatAction[]; errors: string[] }

/**
 * 대화 한 턴: 도구 호출이 끝날 때까지 반복한다. 도구 실패는 Claude에게 알려서 고치거나 사용자에게 묻게 한다.
 * getData는 매 단계 최신 앱 데이터를 돌려준다.
 */
export async function runChatTurn(
  db: AppDB,
  getData: () => AppData,
  history: ApiMessage[],
  fetchImpl?: typeof fetch,
): Promise<AgentResult> {
  const actions: ChatAction[] = [];
  const errors: string[] = [];
  const messages: ApiMessage[] = [...history];
  for (let step = 0; step < 8; step++) {
    const d = getData();
    const res = await callClaudeRaw({
      apiKey: d.settings.apiKey,
      model: MODELS.chat,
      system: `${SYSTEM}\n\n[앱 데이터]\n${buildChatContext(d)}`,
      messages,
      tools: buildTools(d),
      effort: 'low',
      fallbacks: true,
      fetchImpl,
    });
    if (res.stop_reason === 'refusal') throw new ClaudeError('bad_response', '이 요청에는 답할 수 없어요');
    // 사고(thinking) 블록 포함 응답 전체를 그대로 이어 붙인다
    messages.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter((b): b is Extract<ApiBlock, { type: 'tool_use' }> => b.type === 'tool_use' && typeof (b as { id?: unknown }).id === 'string');
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    if (res.stop_reason !== 'tool_use' || uses.length === 0) {
      return { text: text || (actions.length ? '기록했어요.' : ''), actions, errors };
    }
    const results: Record<string, unknown>[] = [];
    for (const u of uses) {
      try {
        const a = await runTool(db, getData(), u.name, u.input ?? {});
        actions.push(a);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: `완료: ${a.summary}` });
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(msg);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: '요청이 너무 길어서 여기서 멈췄어요. 나눠서 말해 주세요.', actions, errors };
}

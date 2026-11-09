import { useState } from 'react';
import { Card, Field, SourceTag, Stat } from '../components/ui';
import { adjustStock, newId, recordFinish, updateSettings } from '../db/actions';
import { db } from '../db/db';
import { addDays } from '../domain/dates';
import { formatKRW, formatNum } from '../domain/money';
import { costEfficiency } from '../domain/nutrition';
import { minUnitPrice } from '../domain/optimizer';
import type { FoodItem, Meal, PackOption, ShippingGroup, Unit } from '../domain/types';
import type { AppData } from '../state/useAppData';

const SHIPPING: Record<ShippingGroup, string> = {
  rocketFresh: '로켓프레시(최소 15,000원)', rocket: '로켓배송', sellerRocket: '판매자로켓', sellerFree: '판매자 무료배송', none: '구매 안 함',
};
const UNITS: Unit[] = ['개', '조각', 'g', '잔'];
const num = (s: string) => Number(s.replace(/[^\d.]/g, ''));

function FinishForm({ food, today, onDone }: { food: FoodItem; today: string; onDone: () => void }) {
  const [start, setStart] = useState(addDays(today, -7));
  const [qty, setQty] = useState(String(food.packOptions[0]?.qty ?? ''));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <p className="muted">한 통/한 봉을 다 먹은 기록이에요. 실제 하루 섭취량을 계산하고 재고를 0으로 맞춰요.</p>
      <Field label="먹기 시작한 날">
        <input type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label={`먹은 양 (${food.unit})`}>
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row">
        <button className="btn" onClick={onDone}>취소</button>
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await recordFinish(db, { foodId: food.id, startDate: start, endDate: today, qty: num(qty) });
              await adjustStock(db, food.id, today, 0);
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          기록
        </button>
      </div>
    </div>
  );
}

function FoodEditor({ food, today, onDone }: { food: FoodItem; today: string; onDone: () => void }) {
  const [f, setF] = useState<FoodItem>(food);
  const setPack = (i: number, patch: Partial<PackOption>) =>
    setF({ ...f, packOptions: f.packOptions.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  async function save() {
    const packs = f.packOptions.filter((p) => p.label.trim() && p.qty > 0 && p.price >= 0);
    const changed = packs.filter((p) => !food.packOptions.some((o) => o.label === p.label && o.price === p.price));
    await db.transaction('rw', db.foods, db.prices, async () => {
      await db.foods.put({
        ...f,
        packOptions: packs,
        free: f.shippingGroup === 'none' && packs.length === 0,
        ...(changed.length ? { priceCheckedAt: today, priceSource: 'user' as const } : {}),
      });
      for (const p of changed) await db.prices.put({ id: newId(), foodId: f.id, date: today, packLabel: p.label, price: p.price });
    });
    onDone();
  }
  return (
    <div>
      <Field label="상품명"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="링크(선택)"><input value={f.url ?? ''} onChange={(e) => setF({ ...f, url: e.target.value || undefined })} /></Field>
      <div className="row">
        <Field label="단위">
          <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label={`1${f.unit}당 kcal`}>
          <input inputMode="decimal" defaultValue={f.perUnit.kcal} onChange={(e) => setF({ ...f, perUnit: { ...f.perUnit, kcal: num(e.target.value) } })} />
        </Field>
        <Field label={`1${f.unit}당 단백질g`}>
          <input inputMode="decimal" defaultValue={f.perUnit.protein} onChange={(e) => setF({ ...f, perUnit: { ...f.perUnit, protein: num(e.target.value) } })} />
        </Field>
      </div>
      <Field label="영양 정보 출처">
        <select
          value={f.nutritionSource.kcal}
          onChange={(e) => {
            const v = e.target.value as 'label' | 'estimate';
            setF({ ...f, nutritionSource: { kcal: v, protein: v } });
          }}
        >
          <option value="label">라벨 확인</option>
          <option value="estimate">추정</option>
        </select>
      </Field>
      <Field label="배송">
        <select value={f.shippingGroup} onChange={(e) => setF({ ...f, shippingGroup: e.target.value as ShippingGroup })}>
          {Object.entries(SHIPPING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <p className="muted">포장 옵션 (이름 · {f.unit} 수량 · 가격)</p>
      {f.packOptions.map((p, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <input className="input" aria-label={`포장 ${i + 1} 이름`} value={p.label} onChange={(e) => setPack(i, { label: e.target.value })} />
          <input className="input small" aria-label={`포장 ${i + 1} 수량`} inputMode="numeric" value={p.qty || ''} onChange={(e) => setPack(i, { qty: Math.round(num(e.target.value)) })} />
          <input className="input small" aria-label={`포장 ${i + 1} 가격`} inputMode="numeric" value={p.price || ''} onChange={(e) => setPack(i, { price: Math.round(num(e.target.value)) })} />
          <button className="btn" aria-label={`포장 ${i + 1} 삭제`} onClick={() => setF({ ...f, packOptions: f.packOptions.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => setF({ ...f, packOptions: [...f.packOptions, { label: '', qty: 0, price: 0 }] })}>포장 추가</button>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={onDone}>취소</button>
        <button className="btn primary" onClick={save}>저장</button>
      </div>
    </div>
  );
}

function MealEditor({ meal, index, meals, foods }: { meal: Meal; index: number; meals: Meal[]; foods: FoodItem[] }) {
  const [adding, setAdding] = useState(foods[0]?.id ?? '');
  const save = (items: Meal['items']) => updateSettings(db, { meals: meals.map((m, i) => (i === index ? { ...m, items } : m)) });
  const byId = new Map(foods.map((f) => [f.id, f]));
  return (
    <>
      {meal.items.map((it, ii) => {
        const f = byId.get(it.foodId);
        return (
          <div key={`${it.foodId}-${ii}-${it.qty}`} className="row">
            <span>{f?.name ?? '삭제된 식품'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className="input small"
                aria-label={`${meal.name} ${f?.name ?? ''} 양`}
                inputMode="decimal"
                defaultValue={it.qty}
                onBlur={(e) => {
                  const v = num(e.target.value);
                  if (v >= 0 && v !== it.qty) save(meal.items.map((x, k) => (k === ii ? { ...x, qty: v } : x)));
                }}
              />
              <span className="muted">{f?.unit}</span>
              <button className="btn" aria-label={`${meal.name} ${f?.name ?? ''} 빼기`} onClick={() => save(meal.items.filter((_, k) => k !== ii))}>×</button>
            </span>
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 6 }}>
        <select className="input" aria-label={`${meal.name}에 넣을 식품`} value={adding} onChange={(e) => setAdding(e.target.value)}>
          {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn" onClick={() => adding && save([...meal.items, { foodId: adding, qty: 1 }])}>추가</button>
      </div>
    </>
  );
}

export default function Diet({ data }: { data: AppData }) {
  const [finishing, setFinishing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editMeals, setEditMeals] = useState(false);
  const meals = data.settings.meals;
  const byId = new Map(data.foods.map((f) => [f.id, f]));

  async function addFood() {
    const id = newId();
    await db.foods.put({
      id, name: '새 식품', unit: '개', perUnit: { kcal: 0, protein: 0 }, nutritionSource: { kcal: 'estimate', protein: 'estimate' },
      packOptions: [], free: false, priceCheckedAt: null, priceSource: 'unverified', shippingGroup: 'rocket',
    });
    setEditing(id);
  }

  return (
    <>
      <Card
        title={`하루 계획 ${formatNum(data.nutrition.kcal)}kcal · 단백질 ${formatNum(data.nutrition.protein, 1)}g`}
        action={<button className="btn" onClick={() => setEditMeals(!editMeals)}>{editMeals ? '완료' : '식단 편집'}</button>}
      >
        <p className="muted">목표 {formatNum(data.settings.kcalTarget)}kcal · 단백질 {data.settings.proteinTarget.join('~')}g. 저녁 집밥은 홈에서 원탭으로 골라요.</p>
      </Card>

      {data.nutrition.byMeal.map((bm, mi) => (
        <Card key={`${bm.name}-${mi}`} title={`${bm.name} · ${formatNum(bm.kcal)}kcal · P ${formatNum(bm.protein, 1)}g`}>
          {editMeals ? (
            <MealEditor meal={meals[mi]} index={mi} meals={meals} foods={data.foods} />
          ) : (
            meals[mi].items.map((it, ii) => {
              const f = byId.get(it.foodId);
              return <Stat key={ii} label={f?.name ?? '삭제된 식품'} value={`${formatNum(it.qty, it.qty % 1 ? 1 : 0)}${f?.unit ?? ''}`} />;
            })
          )}
          {bm.name === '저녁' && <p className="muted">+ 집밥 {data.settings.dinner[data.dinnerToday].kcal}kcal (추정)</p>}
        </Card>
      ))}

      <h2 className="screen-title" style={{ margin: '18px 0 8px' }}>식품</h2>
      {data.foods.map((f) => {
        const plan = data.dailyPlan[f.id] ?? 0;
        const measured = data.measured[f.id];
        const eff = costEfficiency(f);
        const unit = minUnitPrice(f);
        if (editing === f.id) {
          return <Card key={f.id} title="식품 편집"><FoodEditor food={f} today={data.today} onDone={() => setEditing(null)} /></Card>;
        }
        return (
          <Card key={f.id} title={f.name} action={<button className="btn" aria-label={`${f.name} 편집`} onClick={() => setEditing(f.id)}>편집</button>}>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <SourceTag source={f.nutritionSource.kcal} />
              <span className="tag">{SHIPPING[f.shippingGroup]}</span>
              {!f.free && <span className="tag">가격 확인 {f.priceCheckedAt ?? '미확인'}</span>}
            </div>
            <Stat
              label="하루 계획"
              value={`${formatNum(plan, plan % 1 ? 1 : 0)}${f.unit}`}
              sub={measured === null ? undefined : `실측 ${formatNum(measured, 1)}${f.unit}/일 · 계획의 ${plan ? Math.round((measured / plan) * 100) : 0}%`}
            />
            {!f.free && <Stat label="재고(추정)" value={`${formatNum(data.stock[f.id] ?? 0, 1)}${f.unit}`} />}
            {!f.free && (
              <div className="row">
                <span className="muted">지금 재고 맞추기</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    key={`${f.id}-${data.stock[f.id]}`}
                    className="input small"
                    aria-label={`${f.name} 지금 재고`}
                    inputMode="decimal"
                    defaultValue={data.stock[f.id] ?? 0}
                    onBlur={(e) => {
                      const v = num(e.target.value);
                      if (e.target.value.trim() !== '' && v >= 0 && v !== (data.stock[f.id] ?? 0)) adjustStock(db, f.id, data.today, v);
                    }}
                  />
                  <span className="muted">{f.unit}</span>
                </span>
              </div>
            )}
            {!f.free && (
              <Stat
                label="가성비"
                value={eff.perKcal === null ? '미입력' : `${formatNum(eff.perKcal, 1)}원/kcal`}
                sub={eff.perProteinG === null ? undefined : `${formatNum(eff.perProteinG)}원/단백질g`}
              />
            )}
            {f.packOptions.map((o) => <Stat key={o.label} label={o.label} value={formatKRW(o.price)} />)}
            {unit !== null && (
              <p className="muted">최저 단가 {f.unit === 'g' ? `${formatKRW(unit * 100)}/100g` : `${formatKRW(unit)}/${f.unit}`}</p>
            )}
            {f.url && <a className="btn" href={f.url} target="_blank" rel="noreferrer">쿠팡에서 열기</a>}{' '}
            {!f.free && (finishing === f.id ? (
              <FinishForm food={f} today={data.today} onDone={() => setFinishing(null)} />
            ) : (
              <button className="btn" aria-label={`${f.name} 다 먹었음`} onClick={() => setFinishing(f.id)}>다 먹었음</button>
            ))}
          </Card>
        );
      })}
      <button className="btn block" onClick={addFood}>+ 새 식품 추가</button>
    </>
  );
}

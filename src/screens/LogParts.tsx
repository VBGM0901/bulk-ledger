import { useState } from 'react';
import { addExtra, removeExtra, setDinner, setItemQty, setMealStatus } from '../db/actions';
import { db } from '../db/db';
import { HOME_KEY, initialItems, STATUS_LABEL, stepOf } from '../domain/intake';
import { formatNum } from '../domain/money';
import type { DinnerChoice, IntakeLog, ISODate, Meal, MealStatus } from '../domain/types';
import type { AppData } from '../state/useAppData';

const STATUSES: MealStatus[] = ['all', 'half', 'none'];
export const DINNER: { id: DinnerChoice; label: string }[] = [
  { id: 'meat', label: '고기 있음' },
  { id: 'none', label: '고기 없음' },
  { id: 'less', label: '덜 먹음' },
];
const fmtQty = (q: number) => formatNum(q, q % 1 ? 1 : 0);

/** 끼니 하나: 다 먹음/반쯤/못 먹음 빠른 체크 + 펼치면 음식별 먹은 양 */
export function MealRow({ data, date, meal, planKcal, log, choice }: {
  data: AppData; date: ISODate; meal: Meal; planKcal?: { kcal: number; protein: number }; log?: IntakeLog; choice: DinnerChoice;
}) {
  const cur = log?.meals[meal.name];
  const items = log?.items?.[meal.name];
  const [open, setOpen] = useState(Boolean(items));
  const [err, setErr] = useState<string | null>(null);
  const initial = initialItems(meal, cur);
  const shown = items ?? initial;
  const homeLabel = DINNER.find((d) => d.id === choice)?.label ?? '';
  const rows = [
    ...Object.keys(initial).filter((k) => k !== HOME_KEY).map((foodId) => {
      const f = data.foods.find((x) => x.id === foodId);
      const planned = meal.items.filter((i) => i.foodId === foodId).reduce((sum, i) => sum + i.qty, 0);
      return { key: foodId, name: f?.name ?? foodId, unit: f?.unit ?? '', planned };
    }),
    ...(meal.name === '저녁' ? [{ key: HOME_KEY, name: `집밥 (${homeLabel})`, unit: '인분', planned: 1 }] : []),
  ];

  async function change(foodId: string, qty: number) {
    try {
      await setItemQty(db, date, meal.name, foodId, Math.max(0, qty), initial);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="meal-check">
      <div className="row">
        <strong>{meal.name}</strong>
        <span className="muted">{planKcal ? `${formatNum(planKcal.kcal)}kcal · P ${formatNum(planKcal.protein, 1)}g` : ''}</span>
      </div>
      <div className="seg" role="group" aria-label={`${meal.name} 먹은 양`}>
        {STATUSES.map((st) => {
          const on = !items && cur === st;
          return (
            <button key={st} aria-pressed={on} onClick={() => setMealStatus(db, date, meal.name, on ? null : st)}>
              {STATUS_LABEL[st]}
            </button>
          );
        })}
      </div>
      <button className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '음식별 닫기 ▴' : '음식별로 체크 ▾'}
        {items ? ' · 음식별 입력됨' : ''}
      </button>
      {open && (
        <ul className="food-list" aria-label={`${meal.name} 음식별 먹은 양`}>
          {rows.map((r) => {
            const qty = shown[r.key] ?? 0;
            const step = stepOf(r.unit, r.key);
            const unit = r.unit === '인분' ? '인분' : r.unit;
            return (
              <li key={r.key} className={qty === 0 ? 'skipped' : ''}>
                <span className="food-name">
                  {r.name}
                  <small className="muted">계획 {fmtQty(r.planned)}{unit}</small>
                </span>
                <span className="stepper">
                  <button className="btn icon" aria-label={`${r.name} 줄이기`} disabled={qty <= 0} onClick={() => change(r.key, qty - step)}>−</button>
                  <span className="num" aria-label={`${r.name} 먹은 양`}>{fmtQty(qty)}{unit}</span>
                  <button className="btn icon" aria-label={`${r.name} 늘리기`} onClick={() => change(r.key, qty + step)}>+</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {meal.name === '저녁' && (
        <div className="seg sub" role="group" aria-label="저녁 반찬">
          {DINNER.map((d) => (
            <button key={d.id} aria-pressed={choice === d.id} onClick={() => setDinner(db, date, d.id)}>{d.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 계획에 없던 음식 (편의점 간식, 외식 등) */
export function ExtraFoods({ data, date, log }: { data: AppData; date: ISODate; log?: IntakeLog }) {
  const [src, setSrc] = useState('custom');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const food = data.foods.find((f) => f.id === src);
  const extras = log?.extras ?? [];

  async function add() {
    try {
      if (food) {
        const q = Number(qty);
        if (!(q > 0)) throw new Error('양을 적어 주세요.');
        await addExtra(db, date, {
          name: food.name, foodId: food.id, qty: q,
          kcal: Math.round(food.perUnit.kcal * q), protein: Math.round(food.perUnit.protein * q * 10) / 10,
        });
      } else {
        if (kcal.trim() === '') throw new Error('칼로리를 적어 주세요. 포장지 뒷면에 있어요.');
        await addExtra(db, date, { name, kcal: Number(kcal), protein: Number(protein || 0) });
      }
      setErr(null);
      setName('');
      setQty('');
      setKcal('');
      setProtein('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="meal-check">
      <div className="row">
        <strong>추가로 먹은 것</strong>
        <span className="muted">계획에 없던 음식</span>
      </div>
      {extras.length === 0 && <p className="muted" style={{ margin: '0 0 8px' }}>편의점 간식·외식 등을 적으면 그날 칼로리에 더해져요.</p>}
      {extras.length > 0 && (
        <ul className="food-list" aria-label="추가로 먹은 음식">
          {extras.map((e) => (
            <li key={e.id}>
              <span className="food-name">
                {e.name}{e.qty ? ` ${fmtQty(e.qty)}${data.foods.find((f) => f.id === e.foodId)?.unit ?? ''}` : ''}
                <small className="muted">{formatNum(e.kcal)}kcal · P {formatNum(e.protein, 1)}g</small>
              </span>
              <button className="btn icon danger" aria-label={`${e.name} 지우기`} onClick={() => removeExtra(db, date, e.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        <span>무엇을 먹었나요</span>
        <select value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="custom">직접 입력 (이름·칼로리)</option>
          {data.foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {food ? (
        <label className="field">
          <span>먹은 양({food.unit})</span>
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={food.unit} />
        </label>
      ) : (
        <>
          <label className="field">
            <span>음식 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 편의점 삼각김밥" />
          </label>
          <div className="row">
            <label className="field"><span>칼로리(kcal)</span><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="포장지 확인" /></label>
            <label className="field"><span>단백질(g)</span><input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="모르면 비움" /></label>
          </div>
        </>
      )}
      <button className="btn" onClick={add}>추가</button>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

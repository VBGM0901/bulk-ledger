import { Check, Plus, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { addExtra, removeExtra, setDinner, setItemQty, setMealStatus, updateExtra } from '../db/actions';
import { db } from '../db/db';
import { DINNER_OPTIONS, mealColor, shortName } from '../domain/display';
import { HOME_KEY, initialItems } from '../domain/intake';
import { formatNum } from '../domain/money';
import type { FavExtra } from '../domain/favorites';
import type { DinnerChoice, IntakeExtra, IntakeLog, ISODate, Meal } from '../domain/types';
import type { AppData } from '../state/useAppData';

const DINNER = DINNER_OPTIONS;
const fmtQty = (q: number) => formatNum(q, q % 1 ? 1 : 0);

/**
 * 끼니 하나 = 색깔 카드. 음식마다 체크 버튼 하나. 체크한 음식만 칼로리에 들어간다.
 * 아무것도 안 눌렀으면 그 끼니는 '기록 없음'.
 */
export function MealChecklist({ data, date, meal, index, log, choice }: {
  data: AppData; date: ISODate; meal: Meal; index: number; log?: IntakeLog; choice: DinnerChoice;
}) {
  const cur = log?.meals[meal.name];
  const items = log?.items?.[meal.name];
  // 저장된 것이 없으면 '아무것도 안 먹음'에서 시작 (예전 '다 먹음/반쯤' 기록은 그 비율로 보여줌)
  const shown = items ?? initialItems(meal, cur ?? 'none');
  const recorded = Boolean(items || cur);
  const home = data.settings.dinner[choice];
  const homeLabel = DINNER.find((d) => d.id === choice)?.label ?? '';

  const rows = [
    ...meal.items.map((it) => {
      const f = data.foods.find((x) => x.id === it.foodId);
      return {
        key: it.foodId,
        name: shortName(f),
        planned: it.qty,
        unitLabel: `${fmtQty(it.qty)}${f?.unit ?? ''}`,
        kcalPer: (f?.perUnit.kcal ?? 0),
        proteinPer: (f?.perUnit.protein ?? 0),
      };
    }),
    ...(meal.name === '저녁'
      ? [{ key: HOME_KEY, name: `집밥 (${homeLabel})`, planned: 1, unitLabel: '1인분', kcalPer: home.kcal, proteinPer: home.protein }]
      : []),
  ];
  const eatenKcal = Math.round(rows.reduce((s, r) => s + r.kcalPer * (shown[r.key] ?? 0), 0));
  const planKcal = Math.round(rows.reduce((s, r) => s + r.kcalPer * r.planned, 0));
  const allOn = rows.every((r) => (shown[r.key] ?? 0) >= r.planned);
  const style = { '--c': mealColor(index) } as CSSProperties;

  async function toggle(key: string, planned: number) {
    const on = (shown[key] ?? 0) > 0;
    await setItemQty(db, date, meal.name, key, on ? 0 : planned, shown);
  }

  return (
    <section className="meal-card" style={style} aria-label={meal.name}>
      <header>
        <span className="meal-dot" aria-hidden />
        <strong>{meal.name}</strong>
        <span className="meal-kcal num">
          {recorded ? `${formatNum(eatenKcal)}` : '–'} <small>/ {formatNum(planKcal)}kcal</small>
        </span>
        <button
          className={`chip ${allOn ? 'on' : ''}`}
          aria-pressed={allOn}
          onClick={() => setMealStatus(db, date, meal.name, allOn ? null : 'all')}
        >
          전부
        </button>
      </header>
      <div className="check-grid">
        {rows.map((r) => {
          const qty = shown[r.key] ?? 0;
          const on = qty > 0;
          const partial = on && qty < r.planned;
          return (
            <button
              key={r.key}
              className={`check ${on ? 'on' : ''}`}
              aria-pressed={on}
              aria-label={`${meal.name} ${r.name} ${r.unitLabel}`}
              onClick={() => toggle(r.key, r.planned)}
            >
              <span className="box" aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
              <span className="check-text">
                <b>{r.name}</b>
                <small>{partial ? `${fmtQty(qty)}/${r.unitLabel}` : r.unitLabel} · {formatNum(r.kcalPer * (on ? qty : r.planned))}kcal</small>
              </span>
            </button>
          );
        })}
      </div>
      {meal.name === '저녁' && (
        <div className="seg sub" role="group" aria-label="저녁 반찬">
          {DINNER.map((d) => (
            <button key={d.id} aria-pressed={choice === d.id} onClick={() => setDinner(db, date, d.id)}>{d.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}

/** 계획에 없던 음식 (편의점 간식, 외식 등). 평소엔 접혀 있다. */
export function ExtraFoods({ date, log, favs = [] }: { date: ISODate; log?: IntakeLog; favs?: FavExtra[] }) {
  const extras = log?.extras ?? [];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const total = extras.reduce((s, e) => s + e.kcal, 0);

  async function add() {
    try {
      if (kcal.trim() === '') throw new Error('칼로리를 적어 주세요. 포장지 뒷면에 있어요.');
      await addExtra(db, date, { name, kcal: Number(kcal), protein: Number(protein || 0) });
      setErr(null);
      setName('');
      setKcal('');
      setProtein('');
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="meal-card" style={{ '--c': 'var(--meal-extra)' } as CSSProperties} aria-label="추가로 먹은 것">
      <header>
        <span className="meal-dot" aria-hidden />
        <strong>추가로 먹은 것</strong>
        <span className="meal-kcal num">{extras.length ? formatNum(total) : '–'} <small>kcal</small></span>
        <button className={`chip ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={14} aria-hidden /> 추가
        </button>
      </header>
      {extras.length === 0 && !open && favs.length === 0 && <p className="muted" style={{ margin: '2px 0 0' }}>계획에 없던 음식은 Claude 탭에서 말하거나 + 추가로 넣어요.</p>}
      {extras.map((e) => <ExtraRow key={e.id} date={date} x={e} />)}
      {favs.length > 0 && (
        <div className="fav-chips" aria-label="자주 먹은 것">
          {favs.map((f) => (
            <button key={`${f.name}|${f.kcal}`} className="chip-btn" onClick={() => addExtra(db, date, { name: f.name, kcal: f.kcal, protein: f.protein })}>
              <Plus size={13} aria-hidden /> {f.name} <b className="num">{f.kcal}</b>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="extra-form">
          <label className="field"><span>음식 이름</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 편의점 삼각김밥" /></label>
          <div className="row">
            <label className="field"><span>칼로리(kcal)</span><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="포장지 확인" /></label>
            <label className="field"><span>단백질(g)</span><input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="모르면 비움" /></label>
          </div>
          <button className="btn primary" onClick={add}>넣기</button>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      )}
    </section>
  );
}

/** 추가 음식 한 줄. 누르면 이름·칼로리·단백질을 고칠 수 있다. */
function ExtraRow({ date, x }: { date: ISODate; x: IntakeExtra }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(x.name);
  const [kcal, setKcal] = useState(String(x.kcal));
  const [protein, setProtein] = useState(String(x.protein));
  const [err, setErr] = useState<string | null>(null);
  if (!edit) {
    return (
      <div className="extra-row">
        <button className="expense-main" aria-label={`${x.name} 고치기`} onClick={() => setEdit(true)}>
          <span><b>{x.name}</b> <small className="muted">{formatNum(x.kcal)}kcal · P {formatNum(x.protein, 1)}g</small></span>
        </button>
        <button className="btn icon small danger" aria-label={`${x.name} 지우기`} onClick={() => removeExtra(db, date, x.id)}><X size={14} aria-hidden /></button>
      </div>
    );
  }
  async function save() {
    try {
      await updateExtra(db, date, x.id, { name, kcal: Number(kcal), protein: Number(protein || 0) });
      setEdit(false);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="expense-edit" aria-label={`${x.name} 고치기`}>
      <label className="field"><span>음식 이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="row">
        <label className="field"><span>칼로리(kcal)</span><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
        <label className="field"><span>단백질(g)</span><input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        <button className="btn" onClick={() => setEdit(false)}>취소</button>
        <button className="btn primary" onClick={save}>저장</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

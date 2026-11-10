import { useState } from 'react';
import type { Screen } from '../App';
import { Card, Stat } from '../components/ui';
import { logWeight, weeklyCheckin } from '../db/actions';
import { db } from '../db/db';
import { weeklyReview } from '../domain/checkin';
import { addDays } from '../domain/dates';
import { dayIntake } from '../domain/intake';
import { formatNum } from '../domain/money';
import { eatingStreak, goalProgress, recentMilestone } from '../domain/motivation';
import { forecastDate, movingAverage } from '../domain/weight';
import type { AppData } from '../state/useAppData';

/** 홈 = 증량. 맨 위는 오늘 먹은 칼로리, 그다음 이번 주·체중. 돈은 가계부 탭에. */
export default function Home({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const { settings } = data;
  const it = data.todayIntake;
  const kcal = it?.kcal ?? 0;
  const target = it?.target ?? settings.kcalTarget;
  const protein = it?.protein ?? 0;
  const pct = Math.min(100, Math.round((kcal / Math.max(1, target)) * 100));
  const avg = movingAverage(data.weights, data.today);
  const goal = settings.weightGoal;
  const forecast = forecastDate(data.weights, goal, data.today);
  const progress = goalProgress(data.weights, goal, data.today);
  const milestone = recentMilestone(data.weights, goal, data.today);

  return (
    <>
      <button className="hero hero-btn" onClick={() => navigate('log')} aria-label={`오늘 ${kcal}kcal 먹음. 눌러서 먹은 것 체크하기`}>
        <div className="label">{it?.grade === 'good' ? '오늘 목표 달성 💪 잘했어요' : '오늘 먹은 칼로리 · 눌러서 체크'}</div>
        <div className="big num">{formatNum(kcal)}<small> / {formatNum(target)} kcal</small></div>
        <div className="hero-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
        <div className="label">단백질 <span className="num">{formatNum(protein, 0)}g</span> / {settings.proteinTarget.join('~')}g · {pct}%</div>
      </button>

      {data.backupStale && (
        <button className="card warn" style={{ textAlign: 'left' }} onClick={() => navigate('settings')}>
          백업한 지 7일이 넘었어요. 눌러서 백업하기
        </button>
      )}

      {milestone && (
        <section className="card celebrate" aria-label="달성 축하">
          <b>🎉 +{milestone.gained}kg 달성!</b>
          <span>7일 평균이 {milestone.kg}kg을 넘었어요.{progress && progress.left > 0 ? ` 목표까지 ${formatNum(progress.left, 1)}kg` : ' 목표 도착!'}</span>
        </section>
      )}

      <WeeklyCheckin data={data} navigate={navigate} />

      <WeekStamp data={data} onOpen={() => navigate('log')} />

      <Card title="체중">
        <QuickWeight data={data} />
        {goal && progress ? (
          <div className="goal-progress" aria-label={`목표 체중 진행 ${Math.round(progress.pct)}%`}>
            <div className="money-row">
              <span><b className="num">{formatNum(progress.now, 1)}kg</b> <small className="muted">7일 평균</small></span>
              <span className="muted">목표 <b className="num">{goal.targetKg}kg</b></span>
            </div>
            <div className="goal-bar"><span style={{ width: `${Math.max(2, progress.pct)}%` }} /></div>
            <div className="money-row">
              <small className="muted">시작 {goal.startKg}kg</small>
              <small><b className="ok num">{Math.round(progress.pct)}%</b> · {progress.left > 0 ? `${formatNum(progress.left, 1)}kg 남음` : '도착!'}</small>
            </div>
          </div>
        ) : (
          <Stat label="7일 평균" value={avg === null ? '기록 없음' : `${formatNum(avg, 1)} kg`} />
        )}
        {goal && forecast && <Stat label="도달 예상" value={`${Number(forecast.slice(5, 7))}월 ${Number(forecast.slice(8))}일쯤`} tone={forecast <= goal.endDate ? 'ok' : 'warn'} />}
        <Stat label="제안" value={data.advice.title} tone={data.advice.kind === 'on-track' ? 'ok' : data.advice.kind === 'need-data' ? undefined : 'warn'} />
      </Card>
    </>
  );
}

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

/** 이번 주(월~일) 7칸 도장. 하루 빠져도 0으로 돌아가지 않는다. */
function WeekStamp({ data, onOpen }: { data: AppData; onOpen: () => void }) {
  const dow = (new Date(`${data.today}T00:00:00`).getDay() + 6) % 7; // 월=0
  const monday = addDays(data.today, -dow);
  const days = WEEK.map((w, i) => {
    const date = addDays(monday, i);
    return { w, date, it: dayIntake(date, data.foods, data.settings, data.dinners, data.intakes), future: date > data.today };
  });
  const good = days.filter((d) => d.it?.grade === 'good').length;
  const streak = eatingStreak(data.today, data.foods, data.settings, data.dinners, data.intakes);
  return (
    <button className="card week-stamp" onClick={onOpen} aria-label={`이번 주 잘 먹은 날 ${good}일. 눌러서 기록 보기`}>
      <div className="row">
        <h2>이번 주</h2>
        {streak.current > 0 ? (
          <span className="streak">🔥 <b className="num">{streak.current}</b>일 연속 잘 먹음{streak.best > streak.current ? <small className="muted"> · 최고 {streak.best}일</small> : ''}</span>
        ) : (
          <span className="muted">95% 이상 먹은 날 <b className="num ok">{good}</b>/7{streak.best > 0 ? ` · 최고 연속 ${streak.best}일` : ''}</span>
        )}
      </div>
      <div className="stamps">
        {days.map((d) => (
          <span key={d.date} className={`stamp ${d.it ? `g-${d.it.grade}` : ''} ${d.future ? 'future' : ''} ${d.date === data.today ? 'today' : ''}`}>
            <i>{d.it ? `${Math.round(d.it.pct * 100)}%` : ''}</i>
            <small>{d.w}</small>
          </span>
        ))}
      </div>
    </button>
  );
}

/** 주간 체크인: 지난 7일 요약 + 제안을 버튼 한 번으로 (MacroFactor식). 이번 주에 한 번만. */
function WeeklyCheckin({ data, navigate }: { data: AppData; navigate: (s: Screen) => void }) {
  const r = weeklyReview(data.today, data.settings, data.foods, data.dinners, data.intakes, data.weights, data.advice);
  if (!r) return null;
  const mine = (data.settings.checkins ?? []).find((c) => c.week === r.week);
  if (r.done) {
    if (!mine || mine.choice !== 'apply') return null;
    return (
      <button className="card hint-card" onClick={() => navigate('diet')}>
        <span>
          <b>이번 주 목표: {formatNum(mine.kcalAfter)}kcal ({mine.delta > 0 ? '+' : ''}{mine.delta})</b>
          <small className="muted">식단 탭 → 식단 편집에서 음식을 {mine.delta > 0 ? '추가' : '줄여'}하세요. 뭘 바꿀지 Claude에게 물어봐도 돼요.</small>
        </span>
      </button>
    );
  }
  const advice = data.advice;
  return (
    <section className="card checkin" aria-label="주간 체크인">
      <div className="row"><h2>주간 체크인</h2><span className="muted">지난 7일</span></div>
      <div className="day-sum">
        <div><span className="muted">잘 먹은 날</span><b className="num">{r.goodDays}/7</b></div>
        <div><span className="muted">평균 달성</span><b className="num">{r.avgPct === null ? '–' : `${Math.round(r.avgPct * 100)}%`}</b></div>
        <div><span className="muted">체중 1주</span><b className="num">{advice.rate === null ? '–' : `${advice.rate >= 0 ? '+' : ''}${formatNum(advice.rate, 1)}`}</b><small className="muted">{advice.rate === null ? '' : 'kg'}</small></div>
      </div>
      <p className="advice"><strong>{advice.title}</strong></p>
      <p className="muted" style={{ marginTop: 0 }}>{advice.detail}</p>
      {r.weighIns < 3 && <p className="muted small-note">체중을 주 3번 이상 재면 판단이 정확해져요.</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        {r.delta !== 0 ? (
          <>
            <button className="btn" onClick={() => weeklyCheckin(db, r.week, 'keep', 0)}>이번 주는 유지</button>
            <button className="btn primary" onClick={() => weeklyCheckin(db, r.week, 'apply', r.delta)}>
              목표 {r.delta > 0 ? '+' : ''}{r.delta}kcal
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => weeklyCheckin(db, r.week, 'ok', 0)}>확인했어요</button>
        )}
      </div>
      <p className="muted small-note">참고용 계산이에요. 한 번에 250kcal 넘게 바꾸지 않아요.</p>
    </section>
  );
}

/** 오늘 체중: 숫자 입력하고 저장 */
function QuickWeight({ data }: { data: AppData }) {
  const todayLog = data.weights.find((w) => w.date === data.today);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      await logWeight(db, data.today, Number(draft));
      setDraft('');
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="quick-weight">
      <span className="muted">오늘 체중{todayLog ? ` · ${formatNum(todayLog.kg, 1)}kg 저장됨` : ''}</span>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input
          className="input small num"
          inputMode="decimal"
          aria-label="오늘 체중(kg)"
          value={draft}
          placeholder={String(todayLog?.kg ?? data.weights.at(-1)?.kg ?? 'kg')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" disabled={!draft.trim()}>저장</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}


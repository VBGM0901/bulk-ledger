import { dinnerLabel } from '../domain/display';
import { useState } from 'react';
import { callClaude, MODELS } from '../claude/client';
import { saveApiKey } from '../claude/key';
import { Card, Field, Stat } from '../components/ui';
import { newId, updateSettings } from '../db/actions';
import { BackupError, exportBackup, importBackup, markBackedUp } from '../db/backup';
import { addDays, todayISO } from '../domain/dates';
import { db } from '../db/db';
import { formatKRW, parseAmount } from '../domain/money';
import type { WeightGoal } from '../domain/types';
import type { AppData } from '../state/useAppData';

async function saveFile(name: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: name });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

export default function Settings({ data }: { data: AppData }) {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [newIncome, setNewIncome] = useState('');
  const [newFixed, setNewFixed] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const s = data.settings;
  const goal: WeightGoal = s.weightGoal ?? { startKg: data.weights.at(-1)?.kg ?? 60, targetKg: (data.weights.at(-1)?.kg ?? 60) + 5, startDate: data.today, endDate: addDays(data.today, 90) };
  const ok = (text: string) => setMsg({ tone: 'ok', text });
  const fail = (text: string) => setMsg({ tone: 'err', text });

  async function onImport(file: File, mode: 'replace' | 'merge') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return fail('JSON 파일을 읽을 수 없어요.');
    }
    if (mode === 'replace' && !window.confirm('지금 데이터를 이 백업으로 바꿀까요? (API 키는 유지돼요)')) return;
    try {
      await importBackup(db, parsed, mode);
      ok(mode === 'merge' ? '개인 데이터를 합쳤어요.' : '백업을 불러왔어요.');
    } catch (e) {
      fail(e instanceof BackupError ? e.message : '불러오지 못했어요.');
    }
  }

  async function onExport() {
    try {
      const file = await exportBackup(db);
      const how = await saveFile(`bulk-ledger-${data.today}.json`, JSON.stringify(file, null, 2));
      await markBackedUp(db);
      ok(how === 'shared' ? '공유 시트에서 "파일에 저장"을 골라 iCloud Drive에 보관하세요.' : '백업 파일을 저장했어요.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') fail('백업 파일을 만들지 못했어요.');
    }
  }

  async function testKey() {
    setTesting(true);
    try {
      await callClaude({ apiKey: s.apiKey, model: MODELS.ping, system: '한 단어로 답해.', messages: [{ role: 'user', content: '연결 확인' }], maxTokens: 10 });
      ok('Claude 연결 OK');
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      {msg && <p className={`card ${msg.tone}`} role={msg.tone === 'err' ? 'alert' : 'status'}>{msg.text}</p>}

      {data.needsSetup && (
        <Card title="처음 설정">
          <p className="muted">PC에서 받은 개인 데이터 파일(seed.json)을 폰에 옮긴 뒤 여기서 고르면 수입·고정비·체중 목표가 한 번에 들어가요.</p>
          <Field label="개인 데이터 파일 합치기">
            <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f, 'merge'); e.target.value = ''; }} />
          </Field>
        </Card>
      )}

      <Card title={`수입 (합계 ${formatKRW(data.summary.income)})`}>
        {data.incomes.map((i) => (
          <div key={i.id} className="row">
            <Field label={i.name}>
              <input key={String(i.amount)} inputMode="numeric" defaultValue={i.amount ?? ''} placeholder="미입력"
                onBlur={(e) => db.incomes.update(i.id, { amount: parseAmount(e.target.value) })} />
            </Field>
            <button className="btn" aria-label={`${i.name} 삭제`} onClick={() => window.confirm(`${i.name}을(를) 지울까요?`) && db.incomes.delete(i.id)}>삭제</button>
          </div>
        ))}
        <div className="row">
          <input className="input" aria-label="새 수입 이름" value={newIncome} onChange={(e) => setNewIncome(e.target.value)} placeholder="예: 부수입" />
          <button className="btn" onClick={async () => {
            if (!newIncome.trim()) return;
            await db.incomes.put({ id: newId(), name: newIncome.trim(), amount: null });
            setNewIncome('');
          }}>수입 추가</button>
        </div>
      </Card>

      <Card title={`고정·정기 지출 (합계 ${formatKRW(data.summary.fixed)})`}>
        {data.recurring.map((r) => (
          <div key={r.id}>
            <div className="row">
              <Field label={r.name}>
                <input key={String(r.monthlyBudget)} inputMode="numeric" defaultValue={r.monthlyBudget ?? ''} placeholder="미입력"
                  onBlur={(e) => db.recurring.update(r.id, { monthlyBudget: parseAmount(e.target.value) })} />
              </Field>
              <button className="btn" aria-label={`${r.name} 삭제`} onClick={() => window.confirm(`${r.name}을(를) 지울까요?`) && db.recurring.delete(r.id)}>삭제</button>
            </div>
            {r.memo && <p className="muted" style={{ marginTop: -6 }}>{r.memo}</p>}
          </div>
        ))}
        <div className="row">
          <input className="input" aria-label="새 고정비 이름" value={newFixed} onChange={(e) => setNewFixed(e.target.value)} placeholder="예: 구독료" />
          <button className="btn" onClick={async () => {
            if (!newFixed.trim()) return;
            await db.recurring.put({ id: newId(), name: newFixed.trim(), category: '고정', monthlyBudget: null, dueDay: null, memo: '' });
            setNewFixed('');
          }}>고정비 추가</button>
        </div>
      </Card>

      <Card title="목표">
        <Field label="월급일 (1~28, 예산월 시작일)">
          <input key={s.payday} inputMode="numeric" defaultValue={s.payday}
            onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v <= 28) updateSettings(db, { payday: v }); }} />
        </Field>
        <Field label="하루 칼로리 목표 (kcal)">
          <input key={s.kcalTarget} inputMode="numeric" defaultValue={s.kcalTarget}
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 1000 && v <= 6000) updateSettings(db, { kcalTarget: v }); }} />
        </Field>
        <div className="row">
          <Field label="단백질 최소 (g)">
            <input key={s.proteinTarget[0]} inputMode="numeric" defaultValue={s.proteinTarget[0]}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0) updateSettings(db, { proteinTarget: [v, Math.max(v, s.proteinTarget[1])] }); }} />
          </Field>
          <Field label="단백질 최대 (g)">
            <input key={s.proteinTarget[1]} inputMode="numeric" defaultValue={s.proteinTarget[1]}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0) updateSettings(db, { proteinTarget: [Math.min(v, s.proteinTarget[0]), v] }); }} />
          </Field>
        </div>
        <p className="muted">체중 목표</p>
        <div className="row">
          <Field label="시작 kg"><input key={`a${goal.startKg}`} inputMode="decimal" defaultValue={goal.startKg}
            onBlur={(e) => { const v = Number(e.target.value); if (v > 20) updateSettings(db, { weightGoal: { ...goal, startKg: v } }); }} /></Field>
          <Field label="목표 kg"><input key={`b${goal.targetKg}`} inputMode="decimal" defaultValue={goal.targetKg}
            onBlur={(e) => { const v = Number(e.target.value); if (v > 20) updateSettings(db, { weightGoal: { ...goal, targetKg: v } }); }} /></Field>
        </div>
        <div className="row">
          <Field label="시작일"><input type="date" value={goal.startDate} onChange={(e) => { const v = e.target.value; if (v && v < goal.endDate) updateSettings(db, { weightGoal: { ...goal, startDate: v } }); }} /></Field>
          <Field label="목표일"><input type="date" value={goal.endDate} onChange={(e) => { const v = e.target.value; if (v && v > goal.startDate) updateSettings(db, { weightGoal: { ...goal, endDate: v } }); }} /></Field>
        </div>
      </Card>

      <Card title="저녁 집밥 추정치">
        {(['meat', 'none', 'less'] as const).map((k) => (
          <div key={k} className="row">
            <span className="muted">{dinnerLabel(k)}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input small" aria-label={`${k} kcal`} key={`k${s.dinner[k].kcal}`} inputMode="numeric" defaultValue={s.dinner[k].kcal}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 0) updateSettings(db, { dinner: { ...s.dinner, [k]: { ...s.dinner[k], kcal: v } } }); }} />
              <span className="muted">kcal</span>
              <input className="input small" aria-label={`${k} 단백질`} key={`p${s.dinner[k].protein}`} inputMode="numeric" defaultValue={s.dinner[k].protein}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 0) updateSettings(db, { dinner: { ...s.dinner, [k]: { ...s.dinner[k], protein: v } } }); }} />
              <span className="muted">g</span>
            </span>
          </div>
        ))}
      </Card>

      <Card title="Claude API 키">
        <p className="muted">
          Max 요금제에 연결한 Console 조직에서 이 앱 전용 키를 만들고 월 사용 한도를 걸어두세요. 키는 이 폰에만 저장되고 백업 파일에도 들어가지 않아요.
        </p>
        <Stat label="상태" value={s.apiKey ? `입력됨 (…${s.apiKey.slice(-4)})` : '없음'} tone={s.apiKey ? 'ok' : 'warn'} />
        <Field label="새 API 키">
          <input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-..." />
        </Field>
        <div className="row">
          <button className="btn" disabled={!s.apiKey} onClick={() => window.confirm('API 키를 지울까요?') && updateSettings(db, { apiKey: '' })}>키 지우기</button>
          <button className="btn" disabled={!s.apiKey || testing} onClick={testKey}>{testing ? '확인 중…' : '연결 확인'}</button>
          <button className="btn primary" disabled={!keyDraft.trim() || testing} onClick={async () => {
            setTesting(true);
            const r = await saveApiKey(db, keyDraft);
            setTesting(false);
            if (r.tone !== 'err') setKeyDraft('');
            if (r.tone === 'err') fail(r.text);
            else ok(r.text);
          }}>{testing ? '확인 중…' : '저장'}</button>
        </div>
      </Card>

      <Card title="나에 대한 메모 (Claude 참고용)">
        <p className="muted">키·나이·운동 루틴 등을 적어두면 Claude가 답할 때 참고해요. 폰에만 저장돼요.</p>
        <Field label="메모">
          <textarea key={s.profileNote} rows={3} defaultValue={s.profileNote}
            onBlur={(e) => { if (e.target.value !== s.profileNote) updateSettings(db, { profileNote: e.target.value.trim() }); }} />
        </Field>
      </Card>

      <Card title="백업">
        <Stat label="마지막 백업" value={s.lastBackupAt ? todayISO(new Date(s.lastBackupAt)) : '없음'} tone={data.backupStale ? 'warn' : 'ok'} />
        <button className="btn primary block" onClick={onExport}>백업 파일 저장</button>
        <Field label="백업 불러오기 (지금 데이터를 교체)">
          <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f, 'replace'); e.target.value = ''; }} />
        </Field>
        {!data.needsSetup && (
          <Field label="개인 데이터 파일 합치기 (지금 데이터는 유지)">
            <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f, 'merge'); e.target.value = ''; }} />
          </Field>
        )}
      </Card>

      <Card title="화면">
        <div className="seg">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} aria-pressed={s.theme === t} onClick={() => updateSettings(db, { theme: t })}>
              {{ system: '자동', light: '라이트', dark: '다크' }[t]}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

import type { ReactNode } from 'react';
import type { NutritionSource } from '../domain/types';

export function Card({ title, children, action }: { title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <div className="row">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'err' | 'ok' }) {
  return (
    <div className="row">
      <span className="muted">{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span className={`num ${tone ?? ''}`}>{value}</span>
        {sub && <div className="muted">{sub}</div>}
      </span>
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SourceTag({ source }: { source: NutritionSource }) {
  return <span className="tag">{source === 'label' ? '✅ 라벨' : '⚠️ 추정'}</span>;
}

export function Notice({ tone, children }: { tone: 'warn' | 'err' | 'ok' | 'muted'; children: ReactNode }) {
  return (
    <p className={`card ${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

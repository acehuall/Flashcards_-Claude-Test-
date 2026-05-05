import React from 'react';
import clsx from 'clsx';

type Accent = 'nav' | 'correct' | 'incorrect' | 'flag';

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
}

const accentClasses: Record<Accent, string> = {
  nav: 'text-app-nav',
  correct: 'text-app-correct',
  incorrect: 'text-app-incorrect',
  flag: 'text-app-flag',
};

export function MetricCard({ label, value, hint, accent = 'nav' }: MetricCardProps) {
  return (
    <div className="rounded-card border border-app-border bg-app-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-secondary">
        {label}
      </p>
      <p className={clsx('mt-3 text-2xl font-bold tracking-tight', accentClasses[accent])}>
        {value}
      </p>
      {hint && (
        <p className="mt-2 text-xs text-app-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}

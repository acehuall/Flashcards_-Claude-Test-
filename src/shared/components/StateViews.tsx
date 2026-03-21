import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Button';

// ─── Loading ──────────────────────────────────────────────────────────────────

export function LoadingSpinner({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-app-secondary">
      <div className="w-8 h-8 border-2 border-app-border border-t-app-nav rounded-full animate-spin" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-8">
      {icon && (
        <div className="text-app-secondary/40 mb-2">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-app-primary">{title}</h3>
      {description && (
        <p className="text-sm text-app-secondary max-w-sm">{description}</p>
      )}
      {action && (
        action.to ? (
          <Link to={action.to}>
            <Button size="md">{action.label}</Button>
          </Link>
        ) : (
          <Button size="md" onClick={action.onClick}>{action.label}</Button>
        )
      )}
    </div>
  );
}

// ─── Not Found ────────────────────────────────────────────────────────────────

export function NotFound({ message = 'Not found', backTo = '/' }: { message?: string; backTo?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-8">
      <span className="text-6xl text-app-secondary/20 font-bold">404</span>
      <h2 className="text-xl font-semibold text-app-primary">{message}</h2>
      <p className="text-sm text-app-secondary">The item you're looking for could not be found.</p>
      <Link to={backTo}>
        <Button variant="secondary">Go back</Button>
      </Link>
    </div>
  );
}

// ─── Page Header ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: { label: string; to: string };
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {back && (
          <Link
            to={back.to}
            className="inline-flex items-center gap-1 text-xs text-app-secondary hover:text-app-primary mb-2 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {back.label}
          </Link>
        )}
        <h1 className="text-xl font-bold tracking-tight text-app-primary sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-app-secondary sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="w-full sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-app-surface text-app-secondary border border-app-border"
      style={color ? { borderColor: color + '40', color, backgroundColor: color + '15' } : undefined}
    >
      {children}
    </span>
  );
}

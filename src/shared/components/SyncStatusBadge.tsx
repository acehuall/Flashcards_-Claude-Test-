import React from 'react';
import clsx from 'clsx';
import { useSync, type SyncStatus } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

interface BadgeConfig {
  label: string;
  title: string;
  iconEl: React.ReactElement;
  colorClass: string;
}

function getBadgeConfig(status: SyncStatus, lastSyncedAt: number | null): BadgeConfig {
  switch (status) {
    case 'syncing':
      return {
        label: 'Syncing',
        title: 'Syncing with cloud…',
        iconEl: <SpinnerIcon className="w-3.5 h-3.5" />,
        colorClass: 'text-app-secondary',
      };
    case 'synced':
      return {
        label: lastSyncedAt ? formatRelativeTime(lastSyncedAt) : 'Synced',
        title: lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced',
        iconEl: <CloudIcon className="w-3.5 h-3.5" />,
        colorClass: 'text-app-correct',
      };
    case 'error':
      return {
        label: 'Sync failed',
        title: 'Sync failed — click to retry',
        iconEl: <CloudIcon className="w-3.5 h-3.5" />,
        colorClass: 'text-app-incorrect',
      };
    case 'offline':
      return {
        label: 'Offline',
        title: 'You are offline — changes will sync when reconnected',
        iconEl: <CloudIcon className="w-3.5 h-3.5" />,
        colorClass: 'text-app-secondary opacity-50',
      };
    default:
      return {
        label: 'Sync',
        title: 'Click to sync',
        iconEl: <CloudIcon className="w-3.5 h-3.5" />,
        colorClass: 'text-app-secondary',
      };
  }
}

/**
 * Compact sync status indicator for the nav bar.
 * Renders nothing when Supabase is not configured or no user is signed in.
 */
export function SyncStatusBadge() {
  const { user, isLocalOnly } = useAuth();
  const { status, lastSyncedAt, sync } = useSync();

  // Don't render if local-only or not signed in
  if (isLocalOnly || !user) return null;

  const config = getBadgeConfig(status, lastSyncedAt);

  return (
    <button
      onClick={sync}
      disabled={status === 'syncing'}
      title={config.title}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
        'hover:bg-app-surface-2/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg-alt disabled:cursor-default',
        config.colorClass,
      )}
    >
      {config.iconEl}
      <span className="hidden sm:inline">{config.label}</span>
    </button>
  );
}

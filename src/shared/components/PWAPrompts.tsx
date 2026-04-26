import React from 'react';
import clsx from 'clsx';
import { usePWA } from '../../hooks/usePWA';

// ─── Icons ────────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function WifiOffIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 9.172a4 4 0 015.656 0M12 21a1 1 0 110-2 1 1 0 010 2zM3 3l18 18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.343 6.343A8 8 0 0119 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Shared banner shell ───────────────────────────────────────────────────────

interface BannerProps {
  children: React.ReactNode;
  colorClass: string;
}

function Banner({ children, colorClass }: BannerProps) {
  return (
    <div
      className={clsx(
        'fixed bottom-safe-bottom left-0 right-0 z-50',
        'flex items-center gap-3 px-4 py-3',
        'border-t border-app-border bg-app-surface/95 backdrop-blur-md',
        'text-sm shadow-xl',
        colorClass,
      )}
    >
      {children}
    </div>
  );
}

// ─── Install prompt ────────────────────────────────────────────────────────────

interface InstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

function InstallBanner({ onInstall, onDismiss }: InstallBannerProps) {
  return (
    <Banner colorClass="text-app-primary">
      <DownloadIcon />
      <p className="flex-1">
        <span className="font-medium">Install Flashcards</span>
        <span className="text-app-secondary hidden sm:inline"> — works offline, no browser bar</span>
      </p>
      <button
        onClick={onInstall}
        className="px-3 py-1 rounded-lg bg-app-nav text-white text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
      >
        Install
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss install prompt"
        className="text-app-secondary hover:text-app-primary transition-colors shrink-0"
      >
        <XIcon />
      </button>
    </Banner>
  );
}

// ─── Update prompt ─────────────────────────────────────────────────────────────

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

function UpdateBanner({ onUpdate, onDismiss }: UpdateBannerProps) {
  return (
    <Banner colorClass="text-app-primary">
      <RefreshIcon />
      <p className="flex-1">
        <span className="font-medium">Update available</span>
        <span className="text-app-secondary hidden sm:inline"> — reload to apply</span>
      </p>
      <button
        onClick={onUpdate}
        className="px-3 py-1 rounded-lg bg-app-nav text-white text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
      >
        Reload
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss update prompt"
        className="text-app-secondary hover:text-app-primary transition-colors shrink-0"
      >
        <XIcon />
      </button>
    </Banner>
  );
}

// ─── Offline banner ────────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'fixed top-14 left-0 right-0 z-30',
        'flex items-center justify-center gap-2 px-4 py-1.5',
        'bg-app-bg-alt/90 backdrop-blur-sm border-b border-app-border',
        'text-xs text-app-secondary',
      )}
    >
      <WifiOffIcon />
      <span>Offline — local changes are saved automatically and will sync when reconnected</span>
    </div>
  );
}

// ─── Composed export ───────────────────────────────────────────────────────────

/**
 * showOfflineBanner: pass true when sync is configured (Supabase present + user logged in),
 * so the offline message about syncing is only shown when it's relevant.
 */
interface PWAPromptsProps {
  showOfflineBanner?: boolean;
}

export function PWAPrompts({ showOfflineBanner = false }: PWAPromptsProps) {
  const {
    isInstallable,
    isOnline,
    needRefresh,
    promptInstall,
    dismissInstall,
    applyUpdate,
    dismissUpdate,
  } = usePWA();

  return (
    <>
      {!isOnline && showOfflineBanner && <OfflineBanner />}
      {needRefresh && <UpdateBanner onUpdate={applyUpdate} onDismiss={dismissUpdate} />}
      {isInstallable && !needRefresh && (
        <InstallBanner onInstall={promptInstall} onDismiss={dismissInstall} />
      )}
    </>
  );
}

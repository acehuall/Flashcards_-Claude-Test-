import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../db/supabase';
import { syncAll } from '../sync/syncAll';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncResult {
  ok: boolean;
  error?: string;
}

interface SyncContextValue {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  sync: () => Promise<SyncResult>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextValue | null>(null);

const LAST_SYNCED_KEY = 'flashcards_last_synced_at';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const stored = localStorage.getItem(LAST_SYNCED_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  // Prevent concurrent syncs
  const isSyncingRef = useRef(false);

  // ── Core sync function ────────────────────────────────────────────────────
  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!supabase) return { ok: true };   // local-only mode — no-op
    if (!user) return { ok: true };       // not signed in — no-op
    if (isSyncingRef.current) return { ok: true }; // already running

    if (!navigator.onLine) {
      setStatus('offline');
      return { ok: false, error: 'Offline' };
    }

    isSyncingRef.current = true;
    setStatus('syncing');
    setError(null);

    try {
      await syncAll(user.id);
      const now = Date.now();
      setLastSyncedAt(now);
      localStorage.setItem(LAST_SYNCED_KEY, String(now));
      setStatus('synced');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setError(message);
      setStatus('error');
      return { ok: false, error: message };
    } finally {
      isSyncingRef.current = false;
    }
  }, [user]);

  // ── Auto-sync on login ────────────────────────────────────────────────────
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (user && user.id !== prevUserIdRef.current) {
      prevUserIdRef.current = user.id;
      sync();
    }
    if (!user) {
      prevUserIdRef.current = null;
      setStatus('idle');
      setError(null);
    }
  }, [user, sync]);

  // ── Retry on reconnect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;

    const handleOnline = () => {
      if (user) sync();
    };
    const handleOffline = () => {
      if (status !== 'syncing') setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set offline immediately if we start offline
    if (!navigator.onLine) setStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, status, sync]);

  return (
    <SyncContext.Provider value={{ status, lastSyncedAt, error, sync }}>
      {children}
    </SyncContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}

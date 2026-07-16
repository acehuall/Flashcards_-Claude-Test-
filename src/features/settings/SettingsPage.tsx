import React, { useEffect, useState } from 'react';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { PageHeader } from '../../shared/components/StateViews';
import { Button } from '../../shared/components/Button';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import type { BaseThemeId } from '../../domain/types';
import { normalizeHex } from '../../theme/colorUtils';
import {
  BASE_THEME_LIST,
  DEFAULT_ACCENT_BY_BASE,
  DEFAULT_ACCENT_HEX,
  DEFAULT_BASE_THEME_ID,
  type BaseThemePreset,
} from '../../theme/themePresets';
import clsx from 'clsx';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  badge?: string;
}

function SettingRow({ checked, onChange, disabled, label, description, badge }: ToggleProps) {
  return (
    <div className={clsx('flex items-center justify-between py-4', disabled && 'opacity-50')}>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-app-primary">{label}</p>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-app-surface border border-app-border text-app-secondary">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-app-secondary mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface',
          checked ? 'bg-app-nav' : 'bg-app-border',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-5 h-5 bg-app-primary rounded-full shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

interface SelectRowProps {
  label: string;
  description?: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  disabled?: boolean;
}

function SelectRow({ label, description, value, options, onChange, disabled }: SelectRowProps) {
  return (
    <div className={clsx('flex items-center justify-between py-4', disabled && 'opacity-50')}>
      <div>
        <p className="text-sm font-medium text-app-primary">{label}</p>
        {description && <p className="text-xs text-app-secondary mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="rounded-lg border border-app-border bg-app-bg-alt px-3 py-1.5 text-sm text-app-primary focus:outline-none focus:ring-2 focus:ring-app-nav-dark focus:ring-offset-2 focus:ring-offset-app-surface"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function tryNormalizeHex(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeHex(value);
  } catch {
    return null;
  }
}

function resolveAccentHex(value: string | undefined, fallback = DEFAULT_ACCENT_HEX): string {
  return tryNormalizeHex(value) ?? fallback;
}

interface ThemeOptionCardProps {
  theme: BaseThemePreset;
  selected: boolean;
  onSelect: (themeId: BaseThemeId) => void;
}

function ThemeOptionCard({ theme, selected, onSelect }: ThemeOptionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const paletteSectionId = `theme-palette-${theme.id}`;
  const paletteItems = [
    { label: 'bg', value: theme.bg },
    { label: 'surface', value: theme.surface },
    { label: 'surface2', value: theme.surface2 },
  ] as const;

  return (
    <div
      className={clsx(
        'rounded-card border p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface',
        selected
          ? 'border-app-nav bg-app-nav/10 ring-1 ring-app-nav/20'
          : 'border-app-border bg-app-surface-2/55 hover:border-app-border-strong hover:bg-app-surface-2/80',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onSelect(theme.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="h-8 w-8 shrink-0 rounded-full border"
              style={{
                backgroundColor: theme.bg,
                borderColor: theme.border2,
              }}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium text-app-primary">{theme.name}</span>
          </span>
          {selected && (
            <span className="shrink-0 rounded-full bg-app-nav px-2 py-0.5 text-[11px] font-semibold text-app-accent-ink">
              Selected
            </span>
          )}
        </button>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={paletteSectionId}
          aria-label={expanded ? `Hide ${theme.name} palette` : `Show ${theme.name} palette`}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface-2/70 text-app-secondary transition-colors hover:border-app-border-strong hover:text-app-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className={clsx('h-4 w-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div id={paletteSectionId} className="mt-3 grid grid-cols-3 gap-2 border-t border-app-border pt-3">
          {paletteItems.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div
                className="h-8 rounded-xl border"
                style={{
                  backgroundColor: item.value,
                  borderColor: theme.border2,
                }}
              />
              <p className="text-[11px] uppercase tracking-wide text-app-secondary">{item.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CloudSyncSection() {
  const { user, isLoading, isLocalOnly, signIn, signInWithGoogle, signOut } = useAuth();
  const { status, lastSyncedAt, error: syncError, sync } = useSync();
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (isLocalOnly) {
    return (
      <div className="py-4">
        <p className="text-sm text-app-secondary">
          Cloud sync not configured. Add Supabase environment variables to enable authentication.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-4"><p className="text-sm text-app-secondary">Loading…</p></div>;
  }

  if (user) {
    const statusLabel: Record<typeof status, string> = {
      idle:    'Not synced yet',
      syncing: 'Syncing…',
      synced:  lastSyncedAt
        ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
        : 'Synced',
      error:   `Error: ${syncError ?? 'Unknown error'}`,
      offline: 'Offline — will sync when reconnected',
    };

    return (
      <div className="py-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-app-primary">{user.email}</p>
          <p className="text-xs text-app-secondary mt-0.5">{statusLabel[status]}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={async () => {
            const result = await sync();
            if (result.ok) {
              addToast('Sync complete', 'success');
            } else if (result.error) {
              addToast(`Sync failed: ${result.error}`, 'error');
            }
          }}
          disabled={status === 'syncing' || status === 'offline'}
        >
          {status === 'syncing' ? 'Syncing…' : 'Sync now'}
        </Button>
        <Button variant="ghost" size="sm" onClick={async () => { await signOut(); addToast('Signed out', 'info'); }}>
          Sign out
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="py-4">
        <p className="text-sm text-app-primary font-medium">Check your inbox</p>
        <p className="text-xs text-app-secondary mt-1">A magic link was sent to {email}. Click it to sign in.</p>
        <button className="text-xs text-app-secondary underline mt-2" onClick={() => setSent(false)}>
          Try a different email
        </button>
      </div>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSending(true);
    const { error } = await signIn(email.trim());
    setIsSending(false);
    if (error) {
      addToast(`Could not send link: ${error}`, 'error');
    } else {
      setSent(true);
      addToast('Magic link sent — check your inbox', 'success');
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      addToast(`Google sign-in failed: ${error}`, 'error');
    }
  };

  return (
    <form onSubmit={handleSend} className="py-4 space-y-3">
      <p className="text-xs text-app-secondary">
        Sign in to enable cloud sync (coming soon). Google is recommended; email magic link is fallback.
      </p>
      <Button type="button" variant="primary" size="sm" onClick={handleGoogleSignIn}>
        Continue with Google
      </Button>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="w-full rounded-lg border border-app-border bg-app-bg-alt px-3 py-2 text-sm text-app-primary focus:outline-none focus:ring-2 focus:ring-app-nav-dark focus:ring-offset-2 focus:ring-offset-app-surface"
      />
      <Button type="submit" variant="primary" size="sm" disabled={isSending}>
        {isSending ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { addToast } = useToast();
  const currentBaseThemeId =
    BASE_THEME_LIST.find((theme) => theme.id === settings.baseThemeId)?.id ?? DEFAULT_BASE_THEME_ID;
  const currentAccentHex = resolveAccentHex(settings.accentHex);
  const [accentDraft, setAccentDraft] = useState(currentAccentHex);

  useEffect(() => {
    setAccentDraft(currentAccentHex);
  }, [currentAccentHex]);

  const commitAccent = (nextAccentHex: string) => {
    const normalized = tryNormalizeHex(nextAccentHex);
    if (!normalized) {
      return;
    }

    updateSettings({
      accentHex: normalized,
      accentByBase: {
        ...(settings.accentByBase ?? {}),
        [currentBaseThemeId]: normalized,
      },
    });
  };

  const handleBaseThemeSelect = (nextBaseThemeId: BaseThemeId) => {
    if (nextBaseThemeId === currentBaseThemeId) {
      return;
    }

    const nextAccentByBase = {
      ...(settings.accentByBase ?? {}),
      [currentBaseThemeId]: currentAccentHex,
    };
    const restoredAccent = resolveAccentHex(nextAccentByBase[nextBaseThemeId], currentAccentHex);

    updateSettings({
      baseThemeId: nextBaseThemeId,
      accentHex: restoredAccent,
      accentByBase: {
        ...nextAccentByBase,
        [nextBaseThemeId]: restoredAccent,
      },
    });
  };

  const handleAccentTextChange = (value: string) => {
    const nextDraft = value.toUpperCase();
    setAccentDraft(nextDraft);

    const normalized = tryNormalizeHex(nextDraft);
    if (normalized) {
      commitAccent(normalized);
    }
  };

  const handleAppearanceReset = () => {
    updateSettings({
      baseThemeId: DEFAULT_BASE_THEME_ID,
      accentHex: DEFAULT_ACCENT_HEX,
      accentByBase: { ...DEFAULT_ACCENT_BY_BASE },
    });
    addToast('Appearance reset to defaults', 'info');
  };

  const handleReset = () => {
    resetSettings();
    addToast('Settings reset to defaults', 'info');
  };

  return (
    <StandardShell>
      <div className="max-w-lg">
        <PageHeader title="Settings" subtitle="App preferences and study configuration" />

        {/* Appearance section */}
        <section className="mb-6">
          <div className="mb-1 flex items-center justify-between gap-3 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary">
              Appearance
            </h2>
            <Button variant="ghost" size="sm" onClick={handleAppearanceReset}>
              Reset appearance
            </Button>
          </div>
          <div className="rounded-card border border-app-border bg-app-surface px-5 py-5">
            <div className="space-y-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-app-primary">Base theme</p>
                    <p className="mt-0.5 text-xs text-app-secondary">
                      Pick one of the five preset palettes for the app foundation.
                    </p>
                  </div>
                </div>

                <div role="radiogroup" aria-label="Base theme" className="mt-4 grid gap-3 sm:grid-cols-2">
                  {BASE_THEME_LIST.map((theme) => (
                    <ThemeOptionCard
                      key={theme.id}
                      theme={theme}
                      selected={theme.id === currentBaseThemeId}
                      onSelect={handleBaseThemeSelect}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t border-app-border pt-5">
                <p className="text-sm font-medium text-app-primary">Accent colour</p>
                <p className="mt-0.5 text-xs text-app-secondary">
                  Choose any accent. Accent changes are saved per base theme.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-3 rounded-xl border border-app-border-strong/70 bg-app-surface-2/75 px-3 py-2">
                    <span className="sr-only">Accent colour picker</span>
                    <input
                      type="color"
                      value={currentAccentHex}
                      onChange={(e) => {
                        const nextHex = e.target.value;
                        setAccentDraft(resolveAccentHex(nextHex));
                        commitAccent(nextHex);
                      }}
                      className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    />
                    <span
                      className="h-6 w-6 rounded-full border border-app-border-strong/70"
                      style={{ backgroundColor: currentAccentHex }}
                      aria-hidden="true"
                    />
                  </label>

                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-app-secondary">
                      Hex
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={7}
                      value={accentDraft}
                      onChange={(e) => handleAccentTextChange(e.target.value)}
                      onBlur={() => setAccentDraft(currentAccentHex)}
                      placeholder={DEFAULT_ACCENT_HEX}
                        className="w-full rounded-lg border border-app-border bg-app-bg-alt px-3 py-2 text-sm text-app-primary focus:outline-none focus:ring-2 focus:ring-app-nav-dark focus:ring-offset-2 focus:ring-offset-app-surface"
                      />
                    </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Review section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Review
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.cardMode === 'multiple-choice'}
              onChange={(v) => updateSettings({ cardMode: v ? 'multiple-choice' : 'flip' })}
              label="Multiple choice mode"
              description="Show 4 answer options instead of a flip card. Correct answer plus 3 distractors from the same set."
            />
            <SettingRow
              checked={settings.shuffleCards}
              onChange={(v) => updateSettings({ shuffleCards: v })}
              label="Shuffle cards"
              description="Randomise card order at the start of each session"
            />
            <SettingRow
              checked={settings.flipAnimation}
              onChange={(v) => updateSettings({ flipAnimation: v })}
              disabled={settings.cardMode === 'multiple-choice'}
              label="Flip animation"
              description="3D flip effect when revealing the answer"
            />
            <SelectRow
              label="Auto-show answer"
              description="Automatically reveal the answer after a delay"
              value={settings.autoShowAnswer}
              options={[
                { value: 0,  label: 'Off' },
                { value: 3,  label: 'After 3 seconds' },
                { value: 5,  label: 'After 5 seconds' },
                { value: 10, label: 'After 10 seconds' },
              ]}
              onChange={(v) => updateSettings({ autoShowAnswer: v as 0 | 3 | 5 | 10 })}
              disabled={settings.cardMode === 'multiple-choice'}
            />
          </div>
        </section>

        {/* Interactions section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Interactions
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.swipeGestures}
              onChange={(v) => updateSettings({ swipeGestures: v })}
              label="Swipe gestures"
              description="Swipe cards left/right/up to mark outcomes"
            />
          </div>
        </section>

        {/* Notifications section */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Notifications
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.studyReminders}
              onChange={(v) => updateSettings({ studyReminders: v })}
              label="Study reminders"
              description="Daily push notifications to encourage study sessions"
              badge="Phase B"
              disabled
            />
          </div>
        </section>

        {/* Cloud sync / Account section */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Account
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card px-5">
            <CloudSyncSection />
          </div>
        </section>

        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </StandardShell>
  );
}

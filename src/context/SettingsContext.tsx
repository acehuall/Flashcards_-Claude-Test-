import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { AppSettings, BaseThemeId } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { normalizeHex } from '../theme/colorUtils';
import {
  DEFAULT_ACCENT_BY_BASE,
  DEFAULT_ACCENT_HEX,
  DEFAULT_BASE_THEME_ID,
  isBaseThemeId,
} from '../theme/themePresets';

const STORAGE_KEY = 'flashcard_settings';
const AUTO_SHOW_OPTIONS = new Set([0, 3, 5, 10]);

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // Silently ignore storage errors
  }
}

function sanitizeSettings(value: unknown): AppSettings {
  const record = asRecord(value);
  const baseThemeId = readBaseThemeId(record.baseThemeId);
  const rememberedAccents = readAccentByBase(record.accentByBase);
  const accentHex = readAccentHex(record.accentHex)
    ?? rememberedAccents[baseThemeId]
    ?? DEFAULT_ACCENT_HEX;
  const accentByBase = {
    ...DEFAULT_ACCENT_BY_BASE,
    ...rememberedAccents,
  };

  accentByBase[baseThemeId] = accentByBase[baseThemeId] ?? accentHex;

  return {
    shuffleCards: readBoolean(record.shuffleCards, DEFAULT_SETTINGS.shuffleCards),
    flipAnimation: readBoolean(record.flipAnimation, DEFAULT_SETTINGS.flipAnimation),
    autoShowAnswer: readAutoShowAnswer(record.autoShowAnswer),
    swipeGestures: readBoolean(record.swipeGestures, DEFAULT_SETTINGS.swipeGestures),
    studyReminders: readBoolean(record.studyReminders, DEFAULT_SETTINGS.studyReminders),
    cardMode: readCardMode(record.cardMode),
    baseThemeId,
    accentHex,
    accentByBase,
  };
}

function readAccentByBase(value: unknown): Partial<Record<BaseThemeId, string>> {
  const record = asRecord(value);
  const nextAccentByBase: Partial<Record<BaseThemeId, string>> = {};

  for (const [themeId, accentHex] of Object.entries(record)) {
    if (!isBaseThemeId(themeId)) {
      continue;
    }

    const normalized = readAccentHex(accentHex);
    if (normalized) {
      nextAccentByBase[themeId] = normalized;
    }
  }

  return nextAccentByBase;
}

function readBaseThemeId(value: unknown): BaseThemeId {
  return typeof value === 'string' && isBaseThemeId(value)
    ? value
    : DEFAULT_BASE_THEME_ID;
}

function readAccentHex(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return normalizeHex(value);
  } catch {
    return null;
  }
}

function readAutoShowAnswer(value: unknown): AppSettings['autoShowAnswer'] {
  return typeof value === 'number' && AUTO_SHOW_OPTIONS.has(value)
    ? value as AppSettings['autoShowAnswer']
    : DEFAULT_SETTINGS.autoShowAnswer;
}

function readCardMode(value: unknown): AppSettings['cardMode'] {
  return value === 'multiple-choice' ? 'multiple-choice' : 'flip';
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = { ...DEFAULT_SETTINGS };
    saveSettings(defaults);
    setSettings(defaults);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

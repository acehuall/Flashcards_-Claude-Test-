import type { BaseThemeId } from '../domain/types';

export type { BaseThemeId } from '../domain/types';

export type AccentPresetId = 'silver' | 'electric' | 'citrus' | 'coral' | 'plum' | 'forest';

export interface BaseThemePreset {
  id: BaseThemeId;
  name: string;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  border2: string;
  ink: string;
  ink2: string;
  ink3: string;
  isDark: boolean;
}

export interface AccentPreset {
  id: AccentPresetId;
  name: string;
  hex: string;
  inkOnAccent: string;
}

export const DEFAULT_BASE_THEME_ID: BaseThemeId = 'graphite';
export const DEFAULT_ACCENT_HEX = '#C8C8CC';

export const BASE_THEME_IDS = [
  'graphite',
  'midnight',
  'ivory',
  'forest',
  'crimson',
] as const satisfies readonly BaseThemeId[];

export const BASE_THEMES = {
  graphite: {
    id: 'graphite',
    name: 'Graphite',
    bg: '#1C1C1E',
    surface: '#26262A',
    surface2: '#2E2E32',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.14)',
    ink: '#F2F2F0',
    ink2: '#B8B6B0',
    ink3: '#7A7872',
    isDark: true,
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    bg: '#0F1117',
    surface: '#1A2235',
    surface2: '#212B44',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.14)',
    ink: '#F5F7FA',
    ink2: '#98A2B3',
    ink3: '#5A6478',
    isDark: true,
  },
  ivory: {
    id: 'ivory',
    name: 'Ivory',
    bg: '#F6F2EA',
    surface: '#F0ECE4',
    surface2: '#F5F1E9',
    border: 'rgba(26,24,20,0.10)',
    border2: 'rgba(26,24,20,0.18)',
    ink: '#1A1814',
    ink2: '#4A4740',
    ink3: '#8A8678',
    isDark: false,
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    bg: '#1A2E26',
    surface: '#22392F',
    surface2: '#2B473B',
    border: 'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.14)',
    ink: '#F0EDE3',
    ink2: '#B5B8A8',
    ink3: '#7A8074',
    isDark: true,
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    bg: '#2A1418',
    surface: '#3A1C22',
    surface2: '#48232C',
    border: 'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.14)',
    ink: '#F4ECEA',
    ink2: '#C4A8AC',
    ink3: '#8A6E72',
    isDark: true,
  },
} as const satisfies Record<BaseThemeId, BaseThemePreset>;

export const BASE_THEME_LIST: BaseThemePreset[] = BASE_THEME_IDS.map((themeId) => BASE_THEMES[themeId]);

export const DEFAULT_ACCENT_BY_BASE: Record<BaseThemeId, string> = {
  graphite: DEFAULT_ACCENT_HEX,
  midnight: DEFAULT_ACCENT_HEX,
  ivory: DEFAULT_ACCENT_HEX,
  forest: DEFAULT_ACCENT_HEX,
  crimson: DEFAULT_ACCENT_HEX,
};

export const ACCENT_PRESET_IDS = [
  'silver',
  'electric',
  'citrus',
  'coral',
  'plum',
  'forest',
] as const satisfies readonly AccentPresetId[];

export const ACCENT_PRESETS = {
  silver: {
    id: 'silver',
    name: 'Silver',
    hex: '#C8C8CC',
    inkOnAccent: '#1C1C1E',
  },
  electric: {
    id: 'electric',
    name: 'Electric',
    hex: '#4C63D2',
    inkOnAccent: '#FFFFFF',
  },
  citrus: {
    id: 'citrus',
    name: 'Citrus',
    hex: '#C9DB3F',
    inkOnAccent: '#1C1C1E',
  },
  coral: {
    id: 'coral',
    name: 'Coral',
    hex: '#E5654A',
    inkOnAccent: '#FFFFFF',
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    hex: '#9D6BD8',
    inkOnAccent: '#FFFFFF',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    hex: '#3E8E5F',
    inkOnAccent: '#FFFFFF',
  },
} as const satisfies Record<AccentPresetId, AccentPreset>;

export const ACCENT_PRESET_LIST: AccentPreset[] = ACCENT_PRESET_IDS.map((accentId) => ACCENT_PRESETS[accentId]);

export function getBaseThemePreset(baseThemeId: BaseThemeId): BaseThemePreset {
  return BASE_THEMES[baseThemeId];
}

export function isBaseThemeId(value: string): value is BaseThemeId {
  return Object.prototype.hasOwnProperty.call(BASE_THEMES, value);
}

export function getAccentPreset(accentPresetId: AccentPresetId): AccentPreset {
  return ACCENT_PRESETS[accentPresetId];
}

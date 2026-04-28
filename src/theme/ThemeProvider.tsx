import { useLayoutEffect, type ReactNode } from 'react';
import { useSettings } from '../context/SettingsContext';
import {
  darkenHex,
  getAccessibleTextOnColor,
  hexToRgb,
  hexToRgbTriplet,
  normalizeHex,
  rgbaStringToChannels,
} from './colorUtils';
import {
  DEFAULT_ACCENT_HEX,
  DEFAULT_BASE_THEME_ID,
  getBaseThemePreset,
  isBaseThemeId,
  type BaseThemePreset,
} from './themePresets';

type ThemeVariableName =
  | '--app-bg'
  | '--app-bg-alt'
  | '--app-surface'
  | '--app-surface-2'
  | '--app-card-q'
  | '--app-card-a'
  | '--app-primary'
  | '--app-secondary'
  | '--app-tertiary'
  | '--app-border'
  | '--app-border-strong'
  | '--app-nav'
  | '--app-nav-dark'
  | '--app-accent-ink'
  | '--app-correct'
  | '--app-incorrect'
  | '--app-flag';

type ThemeVariables = Record<ThemeVariableName, string>;

const FIXED_STATE_VARIABLES: Pick<
  ThemeVariables,
  '--app-correct' | '--app-incorrect' | '--app-flag'
> = {
  '--app-correct': '34 197 94',
  '--app-incorrect': '239 68 68',
  '--app-flag': '251 191 36',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  useLayoutEffect(() => {
    const baseTheme = resolveBaseTheme(settings.baseThemeId);
    const accentHex = resolveAccentHex(settings.accentHex);
    const variables = buildThemeVariables(baseTheme, accentHex);

    applyThemeVariables(document.documentElement.style, variables);
    document.documentElement.dataset.appTheme = baseTheme.isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = baseTheme.isDark ? 'dark' : 'light';
  }, [settings.accentHex, settings.baseThemeId]);

  return <>{children}</>;
}

function buildThemeVariables(baseTheme: BaseThemePreset, accentHex: string): ThemeVariables {
  const accentInkHex = getAccessibleTextOnColor(accentHex);
  const backgroundAltHex = baseTheme.isDark
    ? darkenHex(baseTheme.bg, 0.12)
    : baseTheme.surface2;
  const navDarkHex = darkenHex(accentHex, accentInkHex === '#1A1814' ? 0.28 : 0.18);

  return {
    '--app-bg': hexToRgbTriplet(baseTheme.bg),
    '--app-bg-alt': hexToRgbTriplet(backgroundAltHex),
    '--app-surface': hexToRgbTriplet(baseTheme.surface),
    '--app-surface-2': hexToRgbTriplet(baseTheme.surface2),
    '--app-card-q': hexToRgbTriplet(baseTheme.surface2),
    '--app-card-a': hexToRgbTriplet(baseTheme.surface),
    '--app-primary': hexToRgbTriplet(baseTheme.ink),
    '--app-secondary': hexToRgbTriplet(baseTheme.ink2),
    '--app-tertiary': hexToRgbTriplet(baseTheme.ink3),
    '--app-border': rgbaToOpaqueRgbTriplet(baseTheme.border, baseTheme.surface),
    '--app-border-strong': rgbaToOpaqueRgbTriplet(baseTheme.border2, baseTheme.surface2),
    '--app-nav': hexToRgbTriplet(accentHex),
    '--app-nav-dark': hexToRgbTriplet(navDarkHex),
    '--app-accent-ink': hexToRgbTriplet(accentInkHex),
    ...FIXED_STATE_VARIABLES,
  };
}

function resolveBaseTheme(baseThemeId: string): BaseThemePreset {
  return isBaseThemeId(baseThemeId)
    ? getBaseThemePreset(baseThemeId)
    : getBaseThemePreset(DEFAULT_BASE_THEME_ID);
}

function resolveAccentHex(accentHex: string | undefined): string {
  if (!accentHex) {
    return DEFAULT_ACCENT_HEX;
  }

  try {
    return normalizeHex(accentHex);
  } catch {
    return DEFAULT_ACCENT_HEX;
  }
}

function applyThemeVariables(style: CSSStyleDeclaration, variables: ThemeVariables): void {
  for (const [name, value] of Object.entries(variables) as [ThemeVariableName, string][]) {
    style.setProperty(name, value);
  }
}

// The presets store translucent border colors, but the runtime tokens are
// consumed as opaque RGB channel values throughout Tailwind.
function rgbaToOpaqueRgbTriplet(color: string, backgroundHex: string): string {
  const rgba = rgbaStringToChannels(color);
  if (!rgba) {
    return hexToRgbTriplet(backgroundHex);
  }

  if (rgba.a >= 1) {
    return `${rgba.r} ${rgba.g} ${rgba.b}`;
  }

  const background = hexToRgb(backgroundHex);

  return [
    blendChannel(background.r, rgba.r, rgba.a),
    blendChannel(background.g, rgba.g, rgba.a),
    blendChannel(background.b, rgba.b, rgba.a),
  ].join(' ');
}

function blendChannel(background: number, foreground: number, alpha: number): number {
  return Math.round(background * (1 - alpha) + foreground * alpha);
}

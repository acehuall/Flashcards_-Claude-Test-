const DARK_TEXT_HEX = '#1A1814';
const LIGHT_TEXT_HEX = '#FFFFFF';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaColor extends RgbColor {
  a: number;
}

// Normalizes supported 3- and 6-digit hex colors to uppercase #RRGGBB.
export function normalizeHex(hex: string): string {
  const trimmed = hex.trim();
  const compact = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (!/^(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(compact)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const expanded = compact.length === 3
    ? compact
        .split('')
        .map((char) => char + char)
        .join('')
    : compact;

  return `#${expanded.toUpperCase()}`;
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHex(hex);
  const value = normalized.slice(1);

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function hexToRgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

// Accepts common rgba()/rgb() comma or slash-separated CSS color strings.
export function rgbaStringToChannels(value: string): RgbaColor | null {
  const trimmed = value.trim();

  const commaMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i,
  );

  const slashMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s*\/\s*([0-9]*\.?[0-9]+))?\s*\)$/i,
  );

  const match = commaMatch ?? slashMatch;
  if (!match) {
    return null;
  }

  const channels: RgbaColor = {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };

  if (
    !isRgbChannel(channels.r) ||
    !isRgbChannel(channels.g) ||
    !isRgbChannel(channels.b) ||
    channels.a < 0 ||
    channels.a > 1
  ) {
    return null;
  }

  return channels;
}

export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hexToRgb(hex)) < 0.36;
}

// Amount is a ratio from 0 to 1.
export function darkenHex(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const ratio = clampRatio(amount);

  return rgbToHex({
    r: r * (1 - ratio),
    g: g * (1 - ratio),
    b: b * (1 - ratio),
  });
}

// Amount is a ratio from 0 to 1.
export function lightenHex(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const ratio = clampRatio(amount);

  return rgbToHex({
    r: r + (255 - r) * ratio,
    g: g + (255 - g) * ratio,
    b: b + (255 - b) * ratio,
  });
}

export function getAccessibleTextOnColor(hex: string): string {
  const background = hexToRgb(hex);
  const lightContrast = contrastRatio(background, hexToRgb(LIGHT_TEXT_HEX));
  const darkContrast = contrastRatio(background, hexToRgb(DARK_TEXT_HEX));

  return lightContrast >= darkContrast ? LIGHT_TEXT_HEX : DARK_TEXT_HEX;
}

function clampRatio(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function isRgbChannel(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0').toUpperCase())
    .join('')}`;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function contrastRatio(left: RgbColor, right: RgbColor): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

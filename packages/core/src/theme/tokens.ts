/**
 * Graphein design tokens.
 *
 * Flat, modern aesthetic: solid fills, minimal shadows, restrained radii, and a
 * teal accent. Two built-in themes (light/dark). Token values are literals so
 * this module stays dependency-free; charts combine these with the color module
 * for derived ramps and contrast.
 */

import { categorical } from '../color/palettes';

export interface ThemeColors {
  /** Page/plot background. */
  background: string;
  /** Cards / elevated surfaces (KPI cards, tooltips, table headers). */
  surface: string;
  /** Primary text. */
  text: string;
  /** Secondary / muted text (axis labels, captions). */
  textMuted: string;
  /** Axis baseline color. */
  axis: string;
  /** Gridline color (lighter than the axis). */
  grid: string;
  /** Hairline borders. */
  border: string;
  /** Brand accent (selection, focus, primary series). */
  accent: string;
  /** Categorical series palette. */
  palette: string[];
  /** Positive / up semantics. */
  positive: string;
  /** Negative / down semantics. */
  negative: string;
}

export interface ThemeFont {
  family: string;
  size: { tiny: number; small: number; base: number; large: number; title: number };
  weight: { normal: number; medium: number; bold: number };
}

export interface ThemeTokens {
  name: string;
  dark: boolean;
  color: ThemeColors;
  font: ThemeFont;
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; lg: number };
  stroke: { thin: number; base: number; thick: number };
}

/** A vibrant, accessible categorical palette that reads well on light and dark. */
const PALETTE = categorical('graphein');

const FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const SHARED = {
  font: {
    family: FONT_FAMILY,
    size: { tiny: 10, small: 11, base: 12, large: 14, title: 16 },
    weight: { normal: 400, medium: 500, bold: 600 },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 4, md: 6, lg: 8 },
  stroke: { thin: 1, base: 1.5, thick: 2 },
} as const;

export const lightTheme: ThemeTokens = {
  name: 'light',
  dark: false,
  color: {
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    axis: '#cbd5e1',
    grid: '#eef2f6',
    border: '#e2e8f0',
    accent: '#0d9488',
    palette: PALETTE,
    positive: '#16a34a',
    negative: '#dc2626',
  },
  ...SHARED,
};

export const darkTheme: ThemeTokens = {
  name: 'dark',
  dark: true,
  color: {
    background: '#0b1220',
    surface: '#111a2e',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    axis: '#334155',
    grid: '#1c2740',
    border: '#1e293b',
    accent: '#2dd4bf',
    palette: PALETTE,
    positive: '#22c55e',
    negative: '#f87171',
  },
  ...SHARED,
};

export const themes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge a partial override onto a base token set (arrays replace). */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  if (!isPlainObject(base)) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = out[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      out[key] = deepMerge(baseValue, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export type ThemeInput = string | (Partial<ThemeTokens> & { base?: string });

/**
 * Resolve a theme reference into concrete tokens.
 * - a name ('light' | 'dark') selects a built-in theme
 * - an object deep-merges onto a base theme (override.base or override.dark picks it)
 */
export function resolveTheme(theme?: ThemeInput): ThemeTokens {
  if (theme == null) return lightTheme;
  if (typeof theme === 'string') return themes[theme] ?? lightTheme;
  const baseName = theme.base ?? (theme.dark ? 'dark' : 'light');
  const base = themes[baseName] ?? lightTheme;
  const { base: _ignored, ...override } = theme;
  return deepMerge(base, override);
}

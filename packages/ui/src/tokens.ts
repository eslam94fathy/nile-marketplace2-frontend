// Design tokens (T-C1, approved 2026-10-14, FQ-5). Source of truth for the values; `theme.css` exposes
// them to Tailwind as CSS variables and tokens.test.ts keeps both files equal. Light theme only, LTR.

/** Brand scale, "Nile blue". 600 is the primary colour. */
export const NILE = {
  50: '#E8F3F7',
  100: '#C9E2EC',
  200: '#9CC9DA',
  300: '#66A9C2',
  400: '#348AA8',
  500: '#136F8E',
  600: '#0B5C7A',
  700: '#094A63',
  800: '#073A4E',
  900: '#052A39',
} as const;

/** Neutral scale (slate). */
export const SLATE = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

/**
 * Semantic colours: what components use (`bg-primary`, `text-muted-foreground`, …), in the shadcn/ui naming.
 * `*-muted` are tinted backgrounds for status badges and alerts, with the matching colour as text.
 */
export const SEMANTIC_COLORS = {
  background: '#FFFFFF',
  foreground: SLATE[900],
  card: '#FFFFFF',
  'card-foreground': SLATE[900],
  popover: '#FFFFFF',
  'popover-foreground': SLATE[900],
  primary: NILE[600],
  'primary-hover': NILE[700],
  'primary-foreground': '#FFFFFF',
  secondary: SLATE[100],
  'secondary-foreground': SLATE[900],
  muted: SLATE[100],
  'muted-foreground': SLATE[600],
  accent: NILE[50],
  'accent-foreground': NILE[700],
  destructive: '#B91C1C',
  'destructive-foreground': '#FFFFFF',
  'destructive-muted': '#FEF2F2',
  success: '#15803D',
  'success-foreground': '#FFFFFF',
  'success-muted': '#F0FDF4',
  warning: '#B45309',
  'warning-foreground': '#FFFFFF',
  'warning-muted': '#FFFBEB',
  /** Decorative separators only (not a control boundary). */
  border: SLATE[200],
  /** Boundary of inputs, checkboxes, selects: ≥ 3:1 against the background (WCAG 1.4.11). */
  input: '#7C8BA1',
  /** Focus indicator. */
  ring: NILE[500],
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

/** Minimum contrast: 4.5:1 for text (WCAG 1.4.3), 3:1 for control boundaries and focus (1.4.11). */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_UI_CONTRAST = 3;

export interface ContrastPair {
  readonly foreground: SemanticColor;
  readonly background: SemanticColor;
  readonly min: number;
}

/** Every foreground/background combination the components use. contrast.test.ts checks each one. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'foreground', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'card-foreground', background: 'card', min: MIN_TEXT_CONTRAST },
  { foreground: 'popover-foreground', background: 'popover', min: MIN_TEXT_CONTRAST },
  { foreground: 'muted-foreground', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'muted-foreground', background: 'muted', min: MIN_TEXT_CONTRAST },
  { foreground: 'primary', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'primary-foreground', background: 'primary', min: MIN_TEXT_CONTRAST },
  { foreground: 'primary-foreground', background: 'primary-hover', min: MIN_TEXT_CONTRAST },
  { foreground: 'secondary-foreground', background: 'secondary', min: MIN_TEXT_CONTRAST },
  { foreground: 'accent-foreground', background: 'accent', min: MIN_TEXT_CONTRAST },
  { foreground: 'destructive', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'destructive-foreground', background: 'destructive', min: MIN_TEXT_CONTRAST },
  { foreground: 'destructive', background: 'destructive-muted', min: MIN_TEXT_CONTRAST },
  { foreground: 'success', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'success-foreground', background: 'success', min: MIN_TEXT_CONTRAST },
  { foreground: 'success', background: 'success-muted', min: MIN_TEXT_CONTRAST },
  { foreground: 'warning', background: 'background', min: MIN_TEXT_CONTRAST },
  { foreground: 'warning-foreground', background: 'warning', min: MIN_TEXT_CONTRAST },
  { foreground: 'warning', background: 'warning-muted', min: MIN_TEXT_CONTRAST },
  { foreground: 'input', background: 'background', min: MIN_UI_CONTRAST },
  { foreground: 'ring', background: 'background', min: MIN_UI_CONTRAST },
];

/** Type scale: font size / line height in rem (Tailwind `text-*`). Base 16 px. */
export const TYPE_SCALE = {
  xs: { size: '0.75rem', lineHeight: '1rem' },
  sm: { size: '0.875rem', lineHeight: '1.25rem' },
  base: { size: '1rem', lineHeight: '1.5rem' },
  lg: { size: '1.125rem', lineHeight: '1.75rem' },
  xl: { size: '1.25rem', lineHeight: '1.75rem' },
  '2xl': { size: '1.5rem', lineHeight: '2rem' },
  '3xl': { size: '1.875rem', lineHeight: '2.25rem' },
} as const;

/** Spacing unit: every `p-*`, `gap-*`, `m-*` step is a multiple of it (4 px). */
export const SPACING_UNIT = '0.25rem';

/** Corner radii (Tailwind `rounded-*`). Controls use `md`, cards and dialogs `lg`. */
export const RADII = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
} as const;

/** Elevation (Tailwind `shadow-*`), tinted with slate 900. Cards `xs`, popovers `md`, dialogs `lg`. */
export const SHADOWS = {
  xs: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
  sm: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.08)',
  md: '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.08)',
  lg: '0 10px 15px -3px rgb(15 23 42 / 0.08), 0 4px 6px -4px rgb(15 23 42 / 0.08)',
} as const;

/** CSS variable set by `next/font` in each app layout; `theme.css` puts it first in `--font-sans`. */
export const FONT_VARIABLE = '--font-inter';

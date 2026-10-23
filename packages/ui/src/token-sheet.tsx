// The token page (T-C1): every token rendered through its Tailwind utility, so the page also proves the
// theme wiring. Class names are literal strings (Tailwind only generates classes it finds in the source),
// and there are no inline styles (the CSP has no 'unsafe-inline' for styles, design 01 §10).
import { cn } from './cn';
import { contrastRatio } from './contrast';
import {
  CONTRAST_PAIRS,
  MIN_UI_CONTRAST,
  NILE,
  RADII,
  SEMANTIC_COLORS,
  SHADOWS,
  SLATE,
  TYPE_SCALE,
  type SemanticColor,
} from './tokens';

const NILE_BG = {
  50: 'bg-nile-50',
  100: 'bg-nile-100',
  200: 'bg-nile-200',
  300: 'bg-nile-300',
  400: 'bg-nile-400',
  500: 'bg-nile-500',
  600: 'bg-nile-600',
  700: 'bg-nile-700',
  800: 'bg-nile-800',
  900: 'bg-nile-900',
} as const satisfies Record<keyof typeof NILE, string>;

const SLATE_BG = {
  50: 'bg-slate-50',
  100: 'bg-slate-100',
  200: 'bg-slate-200',
  300: 'bg-slate-300',
  400: 'bg-slate-400',
  500: 'bg-slate-500',
  600: 'bg-slate-600',
  700: 'bg-slate-700',
  800: 'bg-slate-800',
  900: 'bg-slate-900',
} as const satisfies Record<keyof typeof SLATE, string>;

const SEMANTIC_BG = {
  background: 'bg-background',
  foreground: 'bg-foreground',
  card: 'bg-card',
  'card-foreground': 'bg-card-foreground',
  popover: 'bg-popover',
  'popover-foreground': 'bg-popover-foreground',
  primary: 'bg-primary',
  'primary-hover': 'bg-primary-hover',
  'primary-foreground': 'bg-primary-foreground',
  secondary: 'bg-secondary',
  'secondary-foreground': 'bg-secondary-foreground',
  muted: 'bg-muted',
  'muted-foreground': 'bg-muted-foreground',
  accent: 'bg-accent',
  'accent-foreground': 'bg-accent-foreground',
  destructive: 'bg-destructive',
  'destructive-foreground': 'bg-destructive-foreground',
  'destructive-muted': 'bg-destructive-muted',
  success: 'bg-success',
  'success-foreground': 'bg-success-foreground',
  'success-muted': 'bg-success-muted',
  warning: 'bg-warning',
  'warning-foreground': 'bg-warning-foreground',
  'warning-muted': 'bg-warning-muted',
  border: 'bg-border',
  input: 'bg-input',
  ring: 'bg-ring',
} as const satisfies Record<SemanticColor, string>;

const SEMANTIC_TEXT = {
  background: 'text-background',
  foreground: 'text-foreground',
  card: 'text-card',
  'card-foreground': 'text-card-foreground',
  popover: 'text-popover',
  'popover-foreground': 'text-popover-foreground',
  primary: 'text-primary',
  'primary-hover': 'text-primary-hover',
  'primary-foreground': 'text-primary-foreground',
  secondary: 'text-secondary',
  'secondary-foreground': 'text-secondary-foreground',
  muted: 'text-muted',
  'muted-foreground': 'text-muted-foreground',
  accent: 'text-accent',
  'accent-foreground': 'text-accent-foreground',
  destructive: 'text-destructive',
  'destructive-foreground': 'text-destructive-foreground',
  'destructive-muted': 'text-destructive-muted',
  success: 'text-success',
  'success-foreground': 'text-success-foreground',
  'success-muted': 'text-success-muted',
  warning: 'text-warning',
  'warning-foreground': 'text-warning-foreground',
  'warning-muted': 'text-warning-muted',
  border: 'text-border',
  input: 'text-input',
  ring: 'text-ring',
} as const satisfies Record<SemanticColor, string>;

/** Colours checked at 3:1 (control boundaries, focus): shown as borders, not text. */
type BoundaryColor = 'input' | 'ring';
const SEMANTIC_BORDER = {
  input: 'border-input',
  ring: 'border-ring',
} as const satisfies Record<BoundaryColor, string>;

const isBoundaryColor = (color: SemanticColor): color is BoundaryColor => color in SEMANTIC_BORDER;

const TEXT_SIZE = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
} as const satisfies Record<keyof typeof TYPE_SCALE, string>;

const RADIUS = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
} as const satisfies Record<keyof typeof RADII, string>;

const SHADOW = {
  xs: 'shadow-xs',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
} as const satisfies Record<keyof typeof SHADOWS, string>;

const SPACING_STEPS = [
  { step: 1, className: 'w-1' },
  { step: 2, className: 'w-2' },
  { step: 3, className: 'w-3' },
  { step: 4, className: 'w-4' },
  { step: 6, className: 'w-6' },
  { step: 8, className: 'w-8' },
  { step: 12, className: 'w-12' },
  { step: 16, className: 'w-16' },
] as const;

const SECTION = 'space-y-4';
const HEADING = 'text-xl font-semibold';

function Swatch({ name, value, className }: { name: string; value: string; className: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn('size-10 shrink-0 rounded-md border border-border', className)}
      />
      <span className="text-sm">
        <span className="block font-medium">{name}</span>
        <span className="block font-mono text-muted-foreground">{value}</span>
      </span>
    </li>
  );
}

function Scale({
  title,
  scale,
  classes,
}: {
  title: string;
  scale: Record<string, string>;
  classes: Record<string, string>;
}) {
  return (
    <section aria-labelledby={`tokens-${title}`} className={SECTION}>
      <h2 id={`tokens-${title}`} className={HEADING}>
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Object.entries(scale).map(([step, value]) => (
          <Swatch key={step} name={step} value={value} className={classes[step] ?? ''} />
        ))}
      </ul>
    </section>
  );
}

export function TokenSheet() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Design tokens</h1>
        <p className="text-muted-foreground">
          Design tokens for Nile (light theme). Every colour pair below is checked for WCAG 2.2 AA contrast.
        </p>
      </header>

      <Scale title="Nile blue" scale={NILE} classes={NILE_BG} />
      <Scale title="Slate" scale={SLATE} classes={SLATE_BG} />

      <section aria-labelledby="tokens-semantic" className={SECTION}>
        <h2 id="tokens-semantic" className={HEADING}>
          Semantic colours
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Object.entries(SEMANTIC_COLORS).map(([name, value]) => (
            <Swatch key={name} name={name} value={value} className={SEMANTIC_BG[name as SemanticColor]} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-contrast" className={SECTION}>
        <h2 id="tokens-contrast" className={HEADING}>
          Contrast
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pe-4 font-medium">
                Sample
              </th>
              <th scope="col" className="py-2 pe-4 font-medium">
                Foreground on background
              </th>
              <th scope="col" className="py-2 pe-4 font-medium">
                Ratio
              </th>
              <th scope="col" className="py-2 font-medium">
                Required
              </th>
            </tr>
          </thead>
          <tbody>
            {CONTRAST_PAIRS.map(({ foreground, background, min }) => (
              <tr key={`${foreground}/${background}`} className="border-b border-border">
                <td className="py-2 pe-4">
                  {min === MIN_UI_CONTRAST && isBoundaryColor(foreground) ? (
                    // A boundary colour is shown as a boundary: text needs 4.5:1, which it isn't meant for.
                    <span
                      className={cn(
                        'inline-block h-7 w-24 rounded-md border-2',
                        SEMANTIC_BG[background],
                        SEMANTIC_BORDER[foreground],
                      )}
                    >
                      <span className="sr-only">Boundary sample</span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-block rounded-md px-3 py-1',
                        SEMANTIC_BG[background],
                        SEMANTIC_TEXT[foreground],
                      )}
                    >
                      Aa Sample
                    </span>
                  )}
                </td>
                <td className="py-2 pe-4 font-mono">
                  {foreground} on {background}
                </td>
                <td className="py-2 pe-4 tabular-nums">
                  {contrastRatio(SEMANTIC_COLORS[foreground], SEMANTIC_COLORS[background]).toFixed(2)}:1
                </td>
                <td className="py-2 tabular-nums">≥ {min}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="tokens-type" className={SECTION}>
        <h2 id="tokens-type" className={HEADING}>
          Type scale (Inter)
        </h2>
        <ul className="space-y-3">
          {Object.entries(TYPE_SCALE).map(([step, { size, lineHeight }]) => (
            <li key={step} className="flex items-baseline gap-4">
              <span className="w-48 shrink-0 font-mono text-sm text-muted-foreground">
                {step} {size}/{lineHeight}
              </span>
              <span className={TEXT_SIZE[step as keyof typeof TYPE_SCALE]}>
                Your order is on its way · EGP 1,250.00
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-spacing" className={SECTION}>
        <h2 id="tokens-spacing" className={HEADING}>
          Spacing (4 px unit)
        </h2>
        <ul className="space-y-2">
          {SPACING_STEPS.map(({ step, className }) => (
            <li key={step} className="flex items-center gap-4">
              <span className="w-48 shrink-0 font-mono text-sm text-muted-foreground">
                {step} = {step * 4} px
              </span>
              <span aria-hidden="true" className={cn('h-4 bg-primary', className)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-radius" className={SECTION}>
        <h2 id="tokens-radius" className={HEADING}>
          Radius and elevation
        </h2>
        <ul className="flex flex-wrap gap-6 rounded-lg bg-muted p-6">
          {Object.entries(RADII).map(([step, value]) => (
            <li key={step} className="space-y-2 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  'block size-16 border border-input bg-muted',
                  RADIUS[step as keyof typeof RADII],
                )}
              />
              <span className="block font-mono">
                rounded-{step} {value}
              </span>
            </li>
          ))}
          {Object.keys(SHADOWS).map((step) => (
            <li key={step} className="space-y-2 text-sm">
              <span
                aria-hidden="true"
                className={cn('block size-16 rounded-lg bg-card', SHADOW[step as keyof typeof SHADOWS])}
              />
              <span className="block font-mono">shadow-{step}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens-focus" className={SECTION}>
        <h2 id="tokens-focus" className={HEADING}>
          Focus
        </h2>
        <p className="text-sm text-muted-foreground">
          Press Tab to see the focus outline used on every control.
        </p>
        <a href="#tokens-focus" className="inline-block rounded-md px-1 text-primary underline">
          A focusable link
        </a>
      </section>
    </div>
  );
}

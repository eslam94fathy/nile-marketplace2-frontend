import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  CONTRAST_PAIRS,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
  NILE,
  RADII,
  SEMANTIC_COLORS,
  SHADOWS,
  SLATE,
  SPACING_UNIT,
  TYPE_SCALE,
} from './tokens';

// theme.css must carry exactly the values of tokens.ts (the token page and these tests read tokens.ts).
const css = readFileSync(resolve(import.meta.dirname, 'theme.css'), 'utf8');

function cssVariables(source: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const match of source.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) variables.set(name, value.trim());
  }
  return variables;
}

const variables = cssVariables(css);
const valueOf = (name: string): string | undefined => variables.get(name)?.toLowerCase();

describe('theme.css matches tokens.ts', () => {
  it.each(Object.entries(NILE))('nile %s', (step, hex) => {
    expect(valueOf(`--color-nile-${step}`)).toBe(hex.toLowerCase());
  });

  it.each(Object.entries(SLATE))('slate %s', (step, hex) => {
    expect(valueOf(`--color-slate-${step}`)).toBe(hex.toLowerCase());
  });

  it.each(Object.entries(SEMANTIC_COLORS))('semantic %s', (name, hex) => {
    expect(valueOf(`--${name}`)).toBe(hex.toLowerCase());
    expect(valueOf(`--color-${name}`)).toBe(`var(--${name})`);
  });

  it('declares no semantic colour that tokens.ts lacks', () => {
    const semanticInCss = [...css.matchAll(/^\s*--color-([\w-]+):\s*var\(--/gm)].map((match) => match[1]);
    expect(semanticInCss.sort()).toEqual(Object.keys(SEMANTIC_COLORS).sort());
  });

  it.each(Object.entries(TYPE_SCALE))('text %s', (step, { size, lineHeight }) => {
    expect(valueOf(`--text-${step}`)).toBe(size);
    expect(valueOf(`--text-${step}--line-height`)).toBe(lineHeight);
  });

  it('spacing, radii and shadows', () => {
    expect(valueOf('--spacing')).toBe(SPACING_UNIT);
    for (const [step, value] of Object.entries(RADII)) expect(valueOf(`--radius-${step}`)).toBe(value);
    for (const [step, value] of Object.entries(SHADOWS)) expect(valueOf(`--shadow-${step}`)).toBe(value);
  });

  it("switches off Tailwind's default palette", () => {
    expect(css).toMatch(/--color-\*:\s*initial;/);
  });
});

describe('contrast (WCAG 2.2 AA)', () => {
  it.each(CONTRAST_PAIRS)('$foreground on $background ≥ $min:1', ({ foreground, background, min }) => {
    const ratio = contrastRatio(SEMANTIC_COLORS[foreground], SEMANTIC_COLORS[background]);
    expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });

  it('checks only control boundaries at 3:1; everything else is text at 4.5:1', () => {
    const boundaries = CONTRAST_PAIRS.filter((pair) => pair.min === MIN_UI_CONTRAST).map(
      (pair) => pair.foreground,
    );
    expect(boundaries.sort()).toEqual(['input', 'ring']);
    for (const pair of CONTRAST_PAIRS) expect([MIN_TEXT_CONTRAST, MIN_UI_CONTRAST]).toContain(pair.min);
  });

  it('pairs every foreground colour with at least one background', () => {
    const paired = new Set(CONTRAST_PAIRS.map((pair) => pair.foreground));
    const foregrounds = Object.keys(SEMANTIC_COLORS).filter((name) => name.endsWith('-foreground'));
    for (const name of foregrounds) expect(paired, name).toContain(name);
  });
});

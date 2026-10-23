// WCAG 2.2 contrast ratio (relative luminance of sRGB colours), used to check the token pairs.

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#rrggbb` colour (0 black … 1 white). */
export function relativeLuminance(hex: string): number {
  if (!HEX_COLOUR.test(hex)) throw new RangeError(`Not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 … 21 (order doesn't matter). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

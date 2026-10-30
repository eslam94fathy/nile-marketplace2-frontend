import Decimal from 'decimal.js';

// Ratings (conventions §12.8): the API's average is a decimal string ("4.30"); it is shown with one decimal and
// never recomputed. The stars are a visual aid only, rounded to the nearest half; the text carries the value.

const RatingDecimal = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });

export const MAX_RATING = 5;
/** Backend `RATING_AVG` shape: 0..5 with up to 2 decimals. */
const RATING_PATTERN = /^[0-5](\.\d{1,2})?$/;

export type StarFill = 'full' | 'half' | 'empty';

function parseRating(avg: string): Decimal {
  if (!RATING_PATTERN.test(avg)) throw new RangeError('Not a valid rating string');
  return new RatingDecimal(avg);
}

/** "4.30" → "4.3", "5.00" → "5.0" (one decimal, half up). */
export function formatRating(avg: string): string {
  return parseRating(avg).toFixed(1);
}

/** Five stars for an average, each full, half or empty (rounded to the nearest half star). */
export function starFills(avg: string): StarFill[] {
  const halves = parseRating(avg).times(2).toDecimalPlaces(0).toNumber();
  return Array.from({ length: MAX_RATING }, (_, index) => {
    const left = halves - index * 2;
    if (left >= 2) return 'full';
    return left === 1 ? 'half' : 'empty';
  });
}

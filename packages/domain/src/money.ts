import Decimal from 'decimal.js';

// Money is a decimal string end to end (CLAUDE.md §3, §8): never a JS number. Arithmetic uses a private
// decimal.js clone so the global Decimal configuration stays untouched.
const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const MONEY_DECIMALS = 2;
const RATE_DECIMALS = 4;
const PERCENT_PER_RATE = 100;

/** Any amount the API sends: signed, up to 12 integer digits (NUMERIC(14,2) balances), up to 2 decimals. */
const API_MONEY_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;
/** Backend `RATE_PATTERN`: a decimal string between 0 and 1 with up to 4 decimals, e.g. "0.1000". */
const RATE_PATTERN = /^(0(\.\d{1,4})?|1(\.0{1,4})?)$/;
/** A percent typed by an admin: 0..100 with up to 2 decimals (spec 03, AD-Q-6). */
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

const EGP_FORMAT = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' });
const RANGE_SEPARATOR = ' – ';

function parse(value: string, pattern: RegExp, kind: string): Decimal {
  if (!pattern.test(value)) throw new RangeError(`Not a valid ${kind} string`);
  return new MoneyDecimal(value);
}

/** Parses an API money string (e.g. "150.00", "-5.5"); throws `RangeError` on anything else. */
export function parseMoney(value: string): Decimal {
  return parse(value, API_MONEY_PATTERN, 'money');
}

/** Exact sum of money strings, as a 2-decimal string: `addMoney('0.10', '0.20') === '0.30'`. */
export function addMoney(...values: readonly string[]): string {
  return values
    .reduce((sum, value) => sum.plus(parseMoney(value)), new MoneyDecimal(0))
    .toFixed(MONEY_DECIMALS);
}

/** Whether money string `a` is more than `b`, compared exactly (e.g. an amount typed against a balance). */
export function moneyGreaterThan(a: string, b: string): boolean {
  return parseMoney(a).greaterThan(parseMoney(b));
}

/** `EGP 1,250.00` (Intl `en-EG` output), formatted from the string so no precision is lost. */
export function formatMoney(value: string): string {
  // Intl formats numeric strings exactly (no float conversion); normalise to 2 decimals first.
  return EGP_FORMAT.format(parseMoney(value).toFixed(MONEY_DECIMALS) as `${number}`);
}

/** `EGP 51.00 – EGP 71.00`, or a single amount when both ends are equal (conventions §8). */
export function formatMoneyRange(min: string, max: string): string {
  if (parseMoney(min).equals(parseMoney(max))) return formatMoney(min);
  return `${formatMoney(min)}${RANGE_SEPARATOR}${formatMoney(max)}`;
}

/** API rate to a display percent with 2 decimals: `'0.1000'` → `'10.00'`. */
export function rateToPercent(rate: string): string {
  return parse(rate, RATE_PATTERN, 'rate').times(PERCENT_PER_RATE).toFixed(MONEY_DECIMALS);
}

/** API rate as a plain percent number without trailing zeros, e.g. to prefill an input: `'0.1250'` → `'12.5'`. */
export function ratePercentValue(rate: string): string {
  return new MoneyDecimal(rateToPercent(rate)).toString();
}

/** API rate as a percent for reading, without trailing zeros: `'0.1000'` → `'10%'`, `'0.1250'` → `'12.5%'`. */
export function formatRatePercent(rate: string): string {
  return `${ratePercentValue(rate)}%`;
}

/** Admin percent input to an API rate with 4 decimals: `'10.5'` → `'0.1050'`. Throws above 100. */
export function percentToRate(percent: string): string {
  const value = parse(percent, PERCENT_PATTERN, 'percent');
  if (value.greaterThan(PERCENT_PER_RATE)) throw new RangeError('Not a valid percent string');
  return value.dividedBy(PERCENT_PER_RATE).toFixed(RATE_DECIMALS);
}

/** The largest of some money strings (exact comparison), `'0.00'` for none: the scale of a bar chart. */
export function maxMoney(values: readonly string[]): string {
  return values
    .reduce((max, value) => MoneyDecimal.max(max, parseMoney(value)), new MoneyDecimal(0))
    .toFixed(MONEY_DECIMALS);
}

/**
 * `value` as a percent of `max`, 0..100 with 2 decimals, for drawing a bar (not money): `'0.00'` when `max` is
 * zero or less.
 */
export function moneyShare(value: string, max: string): string {
  const scale = parseMoney(max);
  if (scale.lessThanOrEqualTo(0)) return new MoneyDecimal(0).toFixed(MONEY_DECIMALS);
  return MoneyDecimal.min(
    MoneyDecimal.max(parseMoney(value), 0).dividedBy(scale).times(PERCENT_PER_RATE),
    100,
  ).toFixed(MONEY_DECIMALS);
}

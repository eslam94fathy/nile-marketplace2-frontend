import * as z from 'zod';
import { FIELD_MESSAGES } from './fields';
import { percentToRate } from './money';

// Kept apart from `fields` (T-I3): it needs decimal.js, which forms without money shouldn't download.

/**
 * A rate typed as a percent, 0..100 with up to 2 decimals (spec 03 §2.2, AD-Q-6), sent as the API's fraction
 * string with decimal arithmetic: '12.5' → '0.1250'.
 */
export const percentRate = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, FIELD_MESSAGES.percent)
  .refine((value) => Number(value) <= 100, FIELD_MESSAGES.percent)
  .transform((value) => percentToRate(value));

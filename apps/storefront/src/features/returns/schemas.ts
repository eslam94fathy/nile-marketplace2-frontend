import { fields } from '@nile/domain';
import * as z from 'zod';
import type { RequestReturnBody, ReturnReason } from './api';
import { REQUEST_RETURN_COPY as COPY } from './copy';

// SF-26 form, mirroring `RequestReturnDto` [VERIFIED backend `return-request.dto.ts`]: at least one item, one
// reason, description optional (trimmed 1..1000), refund payout only for cash-on-delivery orders (wallet:
// Egyptian mobile; InstaPay: trimmed 3..100). Photos live outside the form (`useImageUploads`); "at least one
// item" is checked with them, at submit (`hasItems`).

export const DESCRIPTION_MAX = 1000;
const INSTAPAY_MIN = 3;
const INSTAPAY_MAX = 100;
/** Backend `RETURN_LIMITS.MAX_PHOTOS`. */
export const RETURN_MAX_PHOTOS = 4;

export const RETURN_REASONS = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind'] as const;
const PAYOUT_METHODS = ['mobile_wallet', 'instapay'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** At least one item with a quantity (RequestReturnDto `items` min 1). */
export function hasItems(quantities: Readonly<Record<string, number>>): boolean {
  return Object.values(quantities).some((quantity) => quantity > 0);
}

/** Seller-fault reasons need a photo [SPEC 18]. */
export function needsPhoto(reason: ReturnReason | null): boolean {
  return reason !== null && reason !== 'changed_mind';
}

const instapay = fields.trimmedString(INSTAPAY_MIN, INSTAPAY_MAX);

export function requestReturnSchema(cod: boolean) {
  return z
    .object({
      quantities: z.record(z.string(), z.number().int().min(0)),
      reason: z.enum(RETURN_REASONS).nullable(),
      description: fields.nullableTrimmedString(1, DESCRIPTION_MAX),
      payoutMethod: z.enum(PAYOUT_METHODS).nullable(),
      walletNumber: z.string(),
      instapayAddress: z.string(),
    })
    .superRefine((values, context) => {
      if (values.reason === null) {
        context.addIssue({ code: 'custom', path: ['reason'], message: COPY.chooseReason });
      }
      if (!cod) return;
      if (values.payoutMethod === null) {
        context.addIssue({ code: 'custom', path: ['payoutMethod'], message: COPY.choosePayout });
      } else if (values.payoutMethod === 'mobile_wallet') {
        const wallet = fields.egPhone.safeParse(values.walletNumber);
        if (!wallet.success) {
          context.addIssue({
            code: 'custom',
            path: ['walletNumber'],
            message: fields.FIELD_MESSAGES.egPhone,
          });
        }
      } else {
        const address = instapay.safeParse(values.instapayAddress);
        if (!address.success) {
          context.addIssue({
            code: 'custom',
            path: ['instapayAddress'],
            message: address.error.issues[0]?.message ?? fields.FIELD_MESSAGES.required,
          });
        }
      }
    });
}

export type RequestReturnValues = z.input<ReturnType<typeof requestReturnSchema>>;
export type RequestReturnOutput = z.output<ReturnType<typeof requestReturnSchema>>;

export const EMPTY_RETURN: RequestReturnValues = {
  quantities: {},
  reason: null,
  description: '',
  payoutMethod: null,
  walletNumber: '',
  instapayAddress: '',
};

/**
 * `POST /returns`: the items with a quantity, the reason, the description when written, the ready photos, and
 * the payout for COD orders only (a card order must not send it: 400 [VERIFIED backend route summary]).
 */
export function requestBody(
  values: RequestReturnOutput,
  sellerOrderId: string,
  photoMediaIds: readonly string[],
  cod: boolean,
): RequestReturnBody {
  // The schema refuses a missing reason; never guess one.
  if (values.reason === null) throw new Error('requestBody needs a reason');
  const items = Object.entries(values.quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const payout =
    !cod || values.payoutMethod === null
      ? undefined
      : values.payoutMethod === 'mobile_wallet'
        ? { method: values.payoutMethod, walletNumber: fields.egPhone.parse(values.walletNumber) }
        : { method: values.payoutMethod, instapayAddress: values.instapayAddress.trim() };
  return {
    sellerOrderId,
    reason: values.reason,
    items,
    ...(values.description === null ? {} : { description: values.description }),
    ...(photoMediaIds.length === 0 ? {} : { photoMediaIds: [...photoMediaIds] }),
    ...(payout === undefined ? {} : { refundPayout: payout }),
  };
}

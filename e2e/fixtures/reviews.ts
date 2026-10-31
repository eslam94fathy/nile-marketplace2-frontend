import type { Schema } from '@nile/api';
import { expectData, type Accounts } from '@nile/test-utils/e2e';
import { deliveredCodOrder } from './orders';
import type { ReturnTokens } from './returns';

// Review set-up through the API (T-O4): a delivered COD order and the customer's published review of its item,
// for the seller reply (SE-20) and admin moderation (AD-30, AD-31) screens.

export async function publishedReview(
  backend: Accounts['backend'],
  tokens: ReturnTokens,
  agentId: string,
  variantId: string,
  review: { readonly rating: number; readonly title: string; readonly body: string },
): Promise<Schema<'MyReviewDto'>> {
  const order = await deliveredCodOrder(backend, tokens, agentId, variantId);
  const item = order.sellerOrders[0]?.items[0];
  if (item === undefined) throw new Error('order without items');
  return expectData(
    await backend.request('POST', '/api/v1/reviews', {
      token: tokens.customer,
      body: { orderItemId: item.id, ...review } satisfies Schema<'CreateReviewDto'>,
    }),
    201,
  ) as Schema<'MyReviewDto'>;
}

import { isApiError, unwrap } from '@nile/api';
import type { OrderChoice } from '@nile/support-screens';
import { browserApi } from '@/lib/browser-api';
import { SUPPORT_COPY } from './copy';

/** SE-25 offers the seller's latest orders, newest first (as SF-30, TK7-Q1). */
export const SELLER_ORDER_CHOICES_LIMIT = 20;

/**
 * SE-25 order select (spec 02 SE-25): the latest seller orders, plus the one the URL names (SE-15, SE-19) when
 * it is older. Choices are seller orders: the shared form sends the chosen one as `sellerOrderId` only.
 */
export async function loadSellerOrderChoices(
  selectedSellerOrderId: string | null,
  signal: AbortSignal,
): Promise<readonly OrderChoice[]> {
  const [latest, selected] = await Promise.all([
    unwrap(
      browserApi.GET('/api/v1/seller/orders', {
        params: { query: { limit: SELLER_ORDER_CHOICES_LIMIT, sort: '-createdAt' } },
        signal,
      }),
    ),
    selectedSellerOrderId === null
      ? null
      : unwrap(
          browserApi.GET('/api/v1/seller/orders/{sellerOrderId}', {
            params: { path: { sellerOrderId: selectedSellerOrderId } },
            signal,
          }),
        ).catch((error: unknown) => {
          if (isApiError(error, 'SELLER_ORDER_NOT_FOUND', 'VALIDATION_FAILED')) return null;
          throw error;
        }),
  ]);
  const choices: OrderChoice[] = latest.data.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
  }));
  if (selected === null || choices.some((choice) => choice.id === selected.data.id)) return choices;
  return [{ id: selected.data.id, orderNumber: selected.data.orderNumber }, ...choices];
}

/** SE-Q-14 / TL1-Q1: the subject of a ticket about a blocked product; `null` when it can't be read. */
export async function blockedProductSubject(productId: string, signal: AbortSignal): Promise<string | null> {
  try {
    const product = (
      await unwrap(
        browserApi.GET('/api/v1/seller/products/{productId}', { params: { path: { productId } }, signal }),
      )
    ).data;
    return SUPPORT_COPY.blockedProductSubject(product.name);
  } catch (error) {
    if (isApiError(error, 'PRODUCT_NOT_FOUND', 'VALIDATION_FAILED')) return null;
    throw error;
  }
}

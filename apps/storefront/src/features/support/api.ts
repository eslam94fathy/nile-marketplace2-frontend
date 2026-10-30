import { isApiError, unwrap } from '@nile/api';
import type { OrderChoice } from '@nile/support-screens';
import { browserApi } from '@/lib/browser-api';

/** SF-30 offers the customer's latest orders, newest first. */
export const ORDER_CHOICES_LIMIT = 20;

/**
 * SF-30 order select: the latest orders, plus the one the URL names when it is older. That order is read in
 * full, so a parcel from the URL can be named by its seller; a missing one is simply not offered.
 */
export async function loadOrderChoices(
  selectedOrderId: string | null,
  signal: AbortSignal,
): Promise<readonly OrderChoice[]> {
  const [latest, selected] = await Promise.all([
    unwrap(
      browserApi.GET('/api/v1/orders', {
        params: { query: { limit: ORDER_CHOICES_LIMIT, sort: '-createdAt' } },
        signal,
      }),
    ),
    selectedOrderId === null
      ? null
      : unwrap(
          browserApi.GET('/api/v1/orders/{orderId}', {
            params: { path: { orderId: selectedOrderId } },
            signal,
          }),
        ).catch((error: unknown) => {
          if (isApiError(error, 'ORDER_NOT_FOUND', 'VALIDATION_FAILED')) return null;
          throw error;
        }),
  ]);
  const choices: OrderChoice[] = latest.data.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
  }));
  if (selected === null) return choices;
  const order = selected.data;
  const full: OrderChoice = {
    id: order.id,
    orderNumber: order.orderNumber,
    sellers: order.sellerOrders.map((sellerOrder) => ({
      sellerOrderId: sellerOrder.id,
      businessName: sellerOrder.businessName,
    })),
  };
  return choices.some((choice) => choice.id === order.id)
    ? choices.map((choice) => (choice.id === order.id ? full : choice))
    : [full, ...choices];
}

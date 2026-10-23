import { unwrap, type Schema } from '@nile/api';
import { browserApi } from '@/lib/browser-api';

export type KashierSession = Schema<'KashierSessionDto'>;

/** `POST /orders/{orderId}/payment/kashier-session`: the open session, or a new one (spec 09 OR-7). */
export async function createKashierSession(orderId: string): Promise<KashierSession> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/orders/{orderId}/payment/kashier-session', { params: { path: { orderId } } }),
    )
  ).data;
}

import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { browserApi } from '@/lib/browser-api';

// Stock of one variant (design 02 §2.3 `stock.movements`, §3.3 "Adjust stock").

export type StockLevel = Schema<'StockLevelDto'>;
export type VariantStock = Schema<'VariantStockDto'>;
export type StockMovement = Schema<'StockMovementDto'>;

const MOVEMENTS_PAGE_SIZE = 20;

export const stockKeys = {
  movements: (variantId: string) => queryKey('seller', 'stock', 'movements', { variantId }),
};

/** SE-13: newest first (the only sort the API offers), 20 per page, stale 0. */
export function movementsListOptions(variantId: string) {
  return infiniteListOptions({
    queryKey: stockKeys.movements(variantId),
    staleTime: 0,
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/variants/{variantId}/stock-movements', {
          params: {
            path: { variantId },
            query: {
              limit: MOVEMENTS_PAGE_SIZE,
              sort: '-createdAt',
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

export interface AdjustStockVariables {
  readonly variantId: string;
  readonly delta: number;
}

/** SE-12: a delta, never an absolute count [SPEC 06 S-6]; idempotent, one key per confirmed adjustment. */
export async function adjustStock(
  { variantId, delta }: AdjustStockVariables,
  idempotencyKey: string,
): Promise<VariantStock> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/variants/{variantId}/stock-adjustments', {
        params: { path: { variantId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { delta },
      }),
    )
  ).data;
}

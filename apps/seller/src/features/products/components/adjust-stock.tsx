'use client';

import { StockAdjustDialog, stockKeys, STOCK_COPY, type VariantStock } from '@/features/stock';
import { toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { productKeys, productQuery, type SellerProduct, type SellerVariant } from '../api';

type Read = 'reading' | 'ready' | 'failed';

export interface AdjustStockProps {
  readonly product: SellerProduct;
  readonly variant: SellerVariant;
  readonly onClose: () => void;
}

/**
 * SE-12 from a variant row: the product is read again first, so the dialog (and its "set to" delta) works on
 * fresh stock (spec 02 SE-12). The caller mounts it per opening (keyed), so every opening reads again.
 */
export function AdjustStock({ product, variant, onClose }: AdjustStockProps) {
  const queryClient = useQueryClient();
  const [read, setRead] = useState<Read>('reading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    queryClient
      .query({ ...productQuery(product.id), staleTime: 0 })
      .then(() => {
        if (current) setRead('ready');
      })
      .catch(() => {
        if (current) setRead('failed');
      });
    return () => {
      current = false;
    };
  }, [queryClient, product.id, attempt]);

  const fresh = product.variants.find((item) => item.id === variant.id);
  useEffect(() => {
    // Deleted meanwhile (another tab): nothing to adjust.
    if (read === 'ready' && fresh === undefined) {
      toast({ title: STOCK_COPY.variantGone, tone: 'destructive' });
      onClose();
    }
  }, [read, fresh, onClose]);

  const refreshAfterChange = () => {
    void queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };

  const onAdjusted = (stock: VariantStock) => {
    // The row shows the API's new numbers at once; `inStock` follows later (backend projection, SPEC 06 CA-9).
    queryClient.setQueryData(productKeys.detail(product.id), (old: SellerProduct | undefined) =>
      old === undefined
        ? old
        : {
            ...old,
            variants: old.variants.map((item) =>
              item.id === stock.variantId
                ? {
                    ...item,
                    stock: { onHand: stock.onHand, reserved: stock.reserved, sellable: stock.sellable },
                  }
                : item,
            ),
          },
    );
    refreshAfterChange();
    void queryClient.invalidateQueries({ queryKey: stockKeys.movements(variant.id) });
  };

  return (
    <StockAdjustDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variantId={variant.id}
      sku={variant.sku}
      stock={read === 'ready' && fresh !== undefined ? fresh.stock : null}
      loadFailed={read === 'failed'}
      onRetryLoad={() => {
        setRead('reading');
        setAttempt((value) => value + 1);
      }}
      onAdjusted={onAdjusted}
      onStale={refreshAfterChange}
    />
  );
}

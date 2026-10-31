'use client';

import { isApiError } from '@nile/api';
import { errorMessage } from '@nile/query';
import { Button, ConfirmDialog, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import { activateProduct, deactivateProduct, deleteProduct, productKeys, type SellerProduct } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { hasActiveVariant } from '../lib/variants';
import { useProductBlockedHandler } from './product-blocked';

/**
 * SE-10-A2 Publish, A3 Unpublish, A4 Delete. Each answer replaces the cached product (design 02 §3.3); a
 * status that changed meanwhile (`PRODUCT_INVALID_STATUS_TRANSITION`, `PRODUCT_HAS_NO_ACTIVE_VARIANT`)
 * refetches and explains.
 */
export function ProductActions({ product }: { readonly product: SellerProduct }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useSellerAccess();
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);
  const reasonId = useId();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<'unpublish' | 'delete' | null>(null);

  const publishBlocked = access.catalog && !hasActiveVariant(product);
  // Nile's block locks the status (spec 02 §8.3); deleting stays possible.
  const statusLocked = product.adminBlocked;
  const reason = !access.catalog
    ? access.reason
    : statusLocked
      ? COPY.blockedStatusLocked
      : publishBlocked
        ? COPY.publishNeedsVariant
        : null;
  const describedBy = reason === null ? undefined : reasonId;

  const refetch = () => queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });

  const settle = (updated: SellerProduct) => {
    queryClient.setQueryData(productKeys.detail(product.id), updated);
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };

  /** Reports a failure; a product that changed under the page is refetched. */
  const fail = (error: unknown) => {
    if (handleNotApproved(error) || handleBlocked(error)) return;
    if (isApiError(error, 'PRODUCT_INVALID_STATUS_TRANSITION')) {
      void refetch();
      toast({ title: COPY.statusChanged, tone: 'destructive' });
      return;
    }
    if (isApiError(error, 'PRODUCT_HAS_NO_ACTIVE_VARIANT')) {
      void refetch();
      toast({ title: COPY.errors.PRODUCT_HAS_NO_ACTIVE_VARIANT, tone: 'destructive' });
      return;
    }
    toast({ title: errorMessage(error), tone: 'destructive', correlationId: correlationOf(error) });
  };

  const publish = async () => {
    setPending(true);
    try {
      settle(await activateProduct(product.id));
      toast({ title: COPY.published, tone: 'success' });
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  };

  const unpublish = async () => {
    try {
      settle(await deactivateProduct(product.id));
      toast({ title: COPY.unpublished });
    } catch (error) {
      fail(error);
    }
  };

  const remove = async () => {
    try {
      await deleteProduct(product.id);
      queryClient.removeQueries({ queryKey: productKeys.detail(product.id) });
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast({ title: COPY.deleted });
      router.push(ROUTES.products);
    } catch (error) {
      if (isApiError(error, 'PRODUCT_NOT_FOUND')) {
        // Already gone (deleted in another tab): the outcome the seller wanted.
        void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        router.push(ROUTES.products);
        return;
      }
      fail(error);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {product.status === 'active' ? (
          <Button
            variant="outline"
            disabled={!access.catalog || statusLocked}
            aria-describedby={describedBy}
            onClick={() => {
              setConfirm('unpublish');
            }}
          >
            {COPY.unpublish}
          </Button>
        ) : (
          <Button
            loading={pending}
            disabled={!access.catalog || statusLocked || publishBlocked}
            aria-describedby={describedBy}
            onClick={() => void publish()}
          >
            {COPY.publish}
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={!access.catalog}
          aria-describedby={describedBy}
          onClick={() => {
            setConfirm('delete');
          }}
        >
          {COPY.delete}
        </Button>
      </div>
      {reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {reason}
        </p>
      )}
      <ConfirmDialog
        open={confirm === 'unpublish'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={COPY.unpublishTitle}
        description={COPY.unpublishConfirm}
        confirmLabel={COPY.unpublish}
        onConfirm={unpublish}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={COPY.deleteTitle}
        description={COPY.deleteConfirm(product.name)}
        confirmLabel={COPY.delete}
        destructive
        onConfirm={remove}
      />
    </div>
  );
}

const correlationOf = (error: unknown) =>
  isApiError(error) ? (error.correlationId ?? undefined) : undefined;

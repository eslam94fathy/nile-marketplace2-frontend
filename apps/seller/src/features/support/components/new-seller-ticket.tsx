'use client';

import { NEW_TICKET_COPY, NewTicketForm } from '@nile/support-screens';
import { LoadingRegion, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { queryKey } from '@nile/query';
import { blockedProductSubject } from '../api';

export interface NewSellerTicketProps {
  readonly category: string | null;
  readonly sellerOrderId: string | null;
  /** From a blocked product's "Contact support" (SE-Q-14): the subject names the product. */
  readonly productId: string | null;
}

/** SE-25 New ticket: the shared form, with the subject prefilled when a blocked product opened it. */
export function NewSellerTicket({ category, sellerOrderId, productId }: NewSellerTicketProps) {
  const subject = useQuery({
    queryKey: queryKey('seller', 'support', 'product-subject', { productId }),
    queryFn: ({ signal }) => (productId === null ? null : blockedProductSubject(productId, signal)),
    enabled: productId !== null,
    staleTime: 0,
    retry: false,
  });
  if (productId !== null && subject.isPending) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader title={NEW_TICKET_COPY.title} />
        <LoadingRegion className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-32" />
        </LoadingRegion>
      </div>
    );
  }
  return (
    <NewTicketForm
      initial={{
        category,
        orderId: null,
        sellerOrderId,
        // A product that can't be read just leaves the subject empty.
        subject: subject.data ?? null,
      }}
    />
  );
}

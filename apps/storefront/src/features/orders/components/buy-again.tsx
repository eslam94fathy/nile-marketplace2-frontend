'use client';

import { Button, buttonVariants, ConfirmDialog, Dialog, DialogContent, Notice } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { addCartItem, cartKeys, isAmbiguousFailure } from '@/features/cart';
import { ROUTES } from '@/lib/routes';
import type { Order } from '../api';
import { ORDERS_COPY } from '../copy';
import { buyAgainItems, runBuyAgain, type BuyAgainOutcome, type BuyAgainResult } from '../lib/buy-again';

const COPY = ORDERS_COPY.buyAgain;

function outcomeText(outcome: BuyAgainOutcome): string {
  return outcome === 'added' ? COPY.added : COPY.outcomes[outcome];
}

/**
 * SF-18-A3 Buy again (cancelled orders): confirm, add each open item to the cart one at a time, then list
 * what happened to every item. Current prices apply; the order's prices are never used [SPEC 08].
 */
export function BuyAgain({ order }: { readonly order: Order }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BuyAgainResult | null>(null);
  const items = buyAgainItems(order);
  if (items.length === 0) return null;

  return (
    <>
      <Button
        onClick={() => {
          setConfirming(true);
        }}
      >
        {COPY.action}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={COPY.confirmTitle}
        description={COPY.confirm}
        confirmLabel={COPY.confirmAction}
        onConfirm={async () => {
          const outcome = await runBuyAgain(
            items,
            (item) => addCartItem({ variantId: item.variantId, quantity: item.quantity }),
            isAmbiguousFailure,
          );
          // One refresh at the end, whatever happened (design 02 §3.1).
          void queryClient.invalidateQueries({ queryKey: cartKeys.cart() });
          setResult(outcome);
        }}
      />
      <Dialog
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
      >
        <DialogContent
          title={COPY.resultTitle}
          footer={
            <Link href={ROUTES.cart} className={buttonVariants()}>
              {COPY.goToCart}
            </Link>
          }
        >
          {result === null ? null : (
            <div className="space-y-3">
              {result.interrupted ? <Notice>{COPY.interrupted}</Notice> : null}
              <ul className="divide-y divide-border text-sm">
                {result.items.map(({ item, outcome }) => (
                  <li key={item.id} className="flex justify-between gap-4 py-2">
                    <span>{item.productName}</span>
                    <span className={outcome === 'added' ? 'text-success' : 'text-muted-foreground'}>
                      {outcomeText(outcome)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

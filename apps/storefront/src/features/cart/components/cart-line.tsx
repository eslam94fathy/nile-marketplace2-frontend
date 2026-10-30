'use client';

import { isApiError } from '@nile/api';
import { Button, Money, NileImage, QuantityStepper, toast } from '@nile/ui';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { productHref } from '@/features/catalog';
import type { CartLine as CartLineData } from '../api';
import { CART_COPY } from '../copy';
import { useCartActions } from '../hooks';

/** Wait after the last stepper change before saving (spec 01 SF-06). */
export const QUANTITY_DEBOUNCE_MS = 500;
const MAX_PER_LINE = 99;

/** Codes after which the refetched cart itself explains the problem (the line shows its issue). */
const EXPLAINED_BY_CART = ['CART_ITEM_NOT_FOUND', 'INSUFFICIENT_STOCK', 'VARIANT_NOT_PURCHASABLE'] as const;

function attributesText(line: CartLineData): string {
  return line.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ');
}

/** One cart line (spec 01 SF-06): product, options, SKU, prices, quantity, remove, issue notice. */
export function CartLine({ line }: { readonly line: CartLineData }) {
  const { setQuantity, remove } = useCartActions();
  /** The quantity being typed but not saved yet; null shows the cart's own value. */
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? line.quantity;
  const frozen = line.issue === 'UNAVAILABLE' || line.issue === 'OUT_OF_STOCK';
  const max = Math.min(Math.max(line.availableQuantity, 1), MAX_PER_LINE);

  const save = (quantity: number) => {
    setQuantity.mutate(
      { itemId: line.id, quantity },
      {
        onError: (error) => {
          if (!isApiError(error, ...EXPLAINED_BY_CART))
            toast({ title: CART_COPY.updateFailed, tone: 'destructive' });
        },
        // Only clear the draft if nothing newer was typed meanwhile.
        onSettled: () => {
          setDraft((current) => (current === quantity ? null : current));
        },
      },
    );
  };

  useEffect(() => {
    if (draft === null) return undefined;
    const timer = setTimeout(() => {
      save(draft);
    }, QUANTITY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
    // `save` and `line.quantity` change with every render; the draft drives the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <li className="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-start">
      {/* The name next to it names the item (conventions §12.1). */}
      <NileImage
        image={line.image}
        alt=""
        sizes="64px"
        placeholder="product"
        className="size-16 shrink-0 rounded-md bg-muted"
      />
      <div className="space-y-1">
        <Link
          href={productHref(line.productSlug)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {line.productName}
        </Link>
        {line.attributes.length === 0 ? null : (
          <p className="text-sm text-muted-foreground">{attributesText(line)}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {CART_COPY.sku}: {line.sku}
        </p>
        <p className="text-sm">
          <span className="sr-only">{CART_COPY.unitPrice}: </span>
          <Money value={line.unitPrice} />
        </p>
        {line.issue === null ? null : (
          <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>
              {line.issue === 'INSUFFICIENT_STOCK'
                ? CART_COPY.issues.INSUFFICIENT_STOCK(line.availableQuantity)
                : CART_COPY.issues[line.issue]}
            </span>
            {line.issue === 'INSUFFICIENT_STOCK' && line.availableQuantity > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={setQuantity.isPending}
                onClick={() => {
                  setDraft(null);
                  save(line.availableQuantity);
                }}
              >
                {CART_COPY.setTo(line.availableQuantity)}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <QuantityStepper
        value={shown}
        max={Math.max(max, shown)}
        hideLabel
        itemName={line.productName}
        disabled={frozen}
        onChange={(quantity) => {
          const next = Math.min(quantity, max);
          // Back to the saved quantity: nothing to send.
          setDraft(next === line.quantity ? null : next);
        }}
      />
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        <p className="font-semibold">
          <span className="sr-only">{CART_COPY.lineTotal}: </span>
          <Money value={line.lineTotal} />
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-label={CART_COPY.remove(line.productName)}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(line.id);
          }}
        >
          <Trash2 aria-hidden="true" />
          {CART_COPY.removeLabel}
        </Button>
      </div>
    </li>
  );
}

'use client';

import { isApiError } from '@nile/api';
import { imageAlt, VARIANT_STATUS_LABELS } from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  DataTable,
  Money,
  NileImage,
  StatusBadge,
  toast,
  VARIANT_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useId, useState } from 'react';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { STOCK_COPY } from '@/features/stock';
import { variantStockPath } from '@/lib/routes';
import {
  deleteVariant,
  productKeys,
  type EffectiveAttribute,
  type SellerProduct,
  type SellerVariant,
} from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { imageOfVariant } from '../lib/images';
import { canAddVariant, isLastActiveVariant, variantOptionsLabel } from '../lib/variants';
import { AdjustStock } from './adjust-stock';
import { useProductBlockedHandler } from './product-blocked';
import { CreateVariantDialog, EditVariantDialog } from './variant-dialogs';

export interface VariantsSectionProps {
  readonly product: SellerProduct;
  /** The category's effective attributes; null while loading or when the category is unavailable. */
  readonly attributes: readonly EffectiveAttribute[] | null;
  /** The category was deactivated (SE-Q-2): variants can't be added. */
  readonly categoryUnavailable: boolean;
}

/** SE-10 item 4-5: variants with stock, "Adjust stock" (SE-12) and "History" (SE-13), "Add variant". */
export function VariantsSection({ product, attributes, categoryUnavailable }: VariantsSectionProps) {
  const access = useSellerAccess();
  const reasonId = useId();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SellerVariant | null>(null);
  const [deleting, setDeleting] = useState<SellerVariant | null>(null);
  // Each opening gets a new key, so the dialog reads the stock again (SE-12).
  const [adjusting, setAdjusting] = useState<{ variant: SellerVariant; opening: number } | null>(null);
  const closeAdjust = useCallback(() => {
    setAdjusting(null);
  }, []);
  const known = attributes ?? [];
  const showAdd = attributes !== null && canAddVariant(product, attributes);

  const actions = (variant: SellerVariant) => (
    <span className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!access.catalog}
        aria-label={COPY.variant.editAction(variant.sku)}
        onClick={() => {
          setEditing(variant);
        }}
      >
        {COPY.variant.edit}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!access.catalog}
        aria-label={COPY.variant.deleteAction(variant.sku)}
        onClick={() => {
          setDeleting(variant);
        }}
      >
        {COPY.delete}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!access.catalog}
        aria-label={STOCK_COPY.adjustAction(variant.sku)}
        onClick={() => {
          setAdjusting({ variant, opening: Date.now() });
        }}
      >
        {STOCK_COPY.adjust}
      </Button>
      <Link
        href={variantStockPath(product.id, variant.id)}
        aria-label={STOCK_COPY.historyAction(variant.sku)}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        {STOCK_COPY.history}
      </Link>
    </span>
  );

  const columns: readonly DataTableColumn<SellerVariant>[] = [
    {
      id: 'image',
      header: COPY.images.column,
      cell: (variant) => <VariantImage product={product} variant={variant} />,
    },
    { id: 'sku', header: COPY.variantColumns.sku, cell: (variant) => variant.sku },
    {
      id: 'options',
      header: COPY.variantColumns.options,
      cell: (variant) => variantOptionsLabel(variant, known),
    },
    {
      id: 'price',
      header: COPY.variantColumns.price,
      align: 'end',
      cell: (variant) => <Money value={variant.price} />,
    },
    {
      id: 'compareAt',
      header: COPY.variantColumns.compareAt,
      align: 'end',
      cell: (variant) =>
        variant.compareAtPrice === null ? COPY.noPrice : <Money value={variant.compareAtPrice} />,
    },
    {
      id: 'status',
      header: COPY.variantColumns.status,
      cell: (variant) => (
        <StatusBadge value={variant.status} labels={VARIANT_STATUS_LABELS} tones={VARIANT_STATUS_TONES} />
      ),
    },
    {
      id: 'onHand',
      header: COPY.variantColumns.onHand,
      align: 'end',
      cell: (variant) => variant.stock.onHand,
    },
    {
      id: 'reserved',
      header: COPY.variantColumns.reserved,
      align: 'end',
      cell: (variant) => variant.stock.reserved,
    },
    {
      id: 'sellable',
      header: COPY.variantColumns.sellable,
      align: 'end',
      cell: (variant) => variant.stock.sellable,
    },
    { id: 'actions', header: COPY.variantColumns.actions, cell: actions },
  ];

  return (
    <section aria-labelledby="variants-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="variants-heading" className="text-lg font-semibold">
          {COPY.variantsHeading}
        </h2>
        {showAdd && !categoryUnavailable ? (
          <Button
            disabled={!access.catalog}
            aria-describedby={access.reason === null ? undefined : reasonId}
            onClick={() => {
              setCreating(true);
            }}
          >
            {COPY.addVariant}
          </Button>
        ) : null}
      </div>
      {access.reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {access.reason}
        </p>
      )}
      {categoryUnavailable ? (
        <p className="text-sm text-muted-foreground">{COPY.categoryUnavailable}</p>
      ) : null}
      <p className="text-sm text-muted-foreground">{COPY.stockHelp}</p>
      {product.variants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">
          {COPY.noVariants}
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              caption={COPY.variantsCaption}
              columns={columns}
              rows={product.variants}
              getRowId={(variant) => variant.id}
              empty={null}
              hasMore={false}
              loadingMore={false}
              onLoadMore={() => undefined}
            />
          </div>
          {/* Below 768 px the table becomes stacked cards (spec 02 §6). */}
          <ul aria-label={COPY.variantsCaption} className="space-y-3 md:hidden">
            {product.variants.map((variant) => (
              <li key={variant.id} className="space-y-2 rounded-lg border border-border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{variant.sku}</span>
                  <StatusBadge
                    value={variant.status}
                    labels={VARIANT_STATUS_LABELS}
                    tones={VARIANT_STATUS_TONES}
                  />
                </div>
                <p>{variantOptionsLabel(variant, known)}</p>
                <VariantImage product={product} variant={variant} />
                <p>
                  <Money value={variant.price} />
                  {variant.compareAtPrice === null ? null : (
                    <>
                      {' · '}
                      <s>
                        <Money value={variant.compareAtPrice} />
                      </s>
                    </>
                  )}
                </p>
                <dl className="grid grid-cols-3 gap-2">
                  <StockItem label={COPY.variantColumns.onHand} value={variant.stock.onHand} />
                  <StockItem label={COPY.variantColumns.reserved} value={variant.stock.reserved} />
                  <StockItem label={COPY.variantColumns.sellable} value={variant.stock.sellable} />
                </dl>
                {actions(variant)}
              </li>
            ))}
          </ul>
        </>
      )}
      {attributes === null ? null : (
        <>
          <CreateVariantDialog
            open={creating}
            onOpenChange={setCreating}
            product={product}
            attributes={attributes}
          />
          <EditVariantDialog
            product={product}
            attributes={attributes}
            variant={editing}
            onClose={() => {
              setEditing(null);
            }}
          />
        </>
      )}
      {adjusting === null ? null : (
        <AdjustStock
          key={adjusting.opening}
          product={product}
          variant={adjusting.variant}
          onClose={closeAdjust}
        />
      )}
      <DeleteVariantDialog
        product={product}
        variant={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </section>
  );
}

/** SE-10 item 3: the variant's own image, or "Main image" when it shows the product's. */
function VariantImage({
  product,
  variant,
}: {
  readonly product: SellerProduct;
  readonly variant: SellerVariant;
}) {
  const image = imageOfVariant(product, variant.id);
  if (image === null) return <span className="text-muted-foreground">{COPY.images.main}</span>;
  return (
    <NileImage
      image={image}
      alt={imageAlt(image, product.name)}
      sizes="48px"
      placeholder="product"
      className="size-12 rounded-md bg-muted object-cover"
    />
  );
}

function StockItem({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function DeleteVariantDialog({
  product,
  variant,
  onClose,
}: {
  readonly product: SellerProduct;
  readonly variant: SellerVariant | null;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);

  const remove = async () => {
    if (variant === null) return;
    try {
      await deleteVariant(product.id, variant.id);
      toast({ title: COPY.variant.deleted });
    } catch (error) {
      if (!handleNotApproved(error) && !handleBlocked(error) && !isApiError(error, 'VARIANT_NOT_FOUND')) {
        toast({ title: errorMessage(error), tone: 'destructive' });
      }
    } finally {
      // Deleted, already gone (`VARIANT_NOT_FOUND`) or refused: the page shows the API's current state.
      void queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    }
  };

  return (
    <ConfirmDialog
      open={variant !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.variant.deleteTitle}
      description={
        variant === null
          ? ''
          : isLastActiveVariant(product, variant)
            ? `${COPY.variant.deleteConfirm(variant.sku)} ${COPY.variant.lastActive}`
            : COPY.variant.deleteConfirm(variant.sku)
      }
      confirmLabel={COPY.delete}
      destructive
      onConfirm={remove}
    />
  );
}

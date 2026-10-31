'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import {
  fields,
  formatDateTime,
  formatMoney,
  formatMoneyRange,
  imageAlt,
  PRODUCT_STATUS_LABELS,
  VARIANT_STATUS_LABELS,
} from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Badge,
  Button,
  buttonVariants,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  FormAlert,
  NileImage,
  NotFoundScreen,
  PageHeader,
  PRODUCT_STATUS_TONES,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
  VARIANT_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { categoryPathLabel, categoryTreeQuery } from '@/features/catalog';
import { useSellerNames } from '@/features/lookups';
import { publicEnv } from '@/lib/env/public';
import { productReviewsPath, ROUTES, sellerPath, STOREFRONT_PRODUCT_PATH } from '@/lib/routes';
import {
  blockProduct,
  isProductMissing,
  productKeys,
  productQuery,
  unblockProduct,
  type AdminProduct,
  type AdminVariant,
} from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';

const LINK_CLASS = 'text-primary underline-offset-4 hover:underline';

/** AD-27 Product: everything an admin needs to judge a product, and Block / Unblock (spec 03 §7.3). */
export function ProductDetail({ productId }: { readonly productId: string }) {
  const product = useQuery(productQuery(productId));
  if (product.isError) {
    if (isProductMissing(product.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.dashboard} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToDashboard}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void product.refetch()}
          correlationId={isApiError(product.error) ? (product.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (product.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <ProductContent product={product.data} />;
}

function ProductContent({ product }: { readonly product: AdminProduct }) {
  const [dialog, setDialog] = useState<'block' | 'unblock' | null>(null);
  const sellerName = useSellerNames([product.sellerId]);
  const tree = useQuery(categoryTreeQuery());
  const category =
    (tree.data === undefined ? null : categoryPathLabel(tree.data, product.categoryId)) ?? COPY.never;
  const images = [...product.images].sort((a, b) => a.position - b.position);
  const dateOrNever = (iso: string | null) => (iso === null ? COPY.never : formatDateTime(iso));
  const price =
    product.minPrice === null || product.maxPrice === null
      ? COPY.never
      : formatMoneyRange(product.minPrice, product.maxPrice);

  const variantColumns: readonly DataTableColumn<AdminVariant>[] = [
    { id: 'sku', header: COPY.variantColumns.sku, cell: (variant) => variant.sku },
    {
      id: 'options',
      header: COPY.variantColumns.options,
      cell: (variant) =>
        variant.options.length === 0
          ? COPY.defaultVariant
          : variant.options.map((option) => option.value).join(' / '),
    },
    {
      id: 'price',
      header: COPY.variantColumns.price,
      align: 'end',
      cell: (variant) => formatMoney(variant.price),
    },
    {
      id: 'status',
      header: COPY.variantColumns.status,
      cell: (variant) => (
        <StatusBadge value={variant.status} labels={VARIANT_STATUS_LABELS} tones={VARIANT_STATUS_TONES} />
      ),
    },
    {
      id: 'stock',
      header: COPY.variantColumns.stock,
      align: 'end',
      cell: (variant) => variant.stock.sellable,
    },
    {
      id: 'onHand',
      header: COPY.variantColumns.onHand,
      align: 'end',
      cell: (variant) => variant.stock.onHand,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={product.status} labels={PRODUCT_STATUS_LABELS} tones={PRODUCT_STATUS_TONES} />
            {product.adminBlocked ? <Badge tone="destructive">{COPY.blocked}</Badge> : null}
            <Badge tone={product.visible ? 'success' : 'neutral'}>
              {product.visible ? COPY.visible : COPY.notVisible}
            </Badge>
          </span>
        }
        actions={
          product.adminBlocked ? (
            <Button
              variant="outline"
              onClick={() => {
                setDialog('unblock');
              }}
            >
              {COPY.unblock}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                setDialog('block');
              }}
            >
              {COPY.block}
            </Button>
          )
        }
      />
      {product.adminBlocked && product.adminBlockReason !== null ? (
        <FormAlert title={COPY.blockReason}>{product.adminBlockReason}</FormAlert>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="product-details" title={COPY.detailsHeading}>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.seller}>
              <Link href={sellerPath(product.sellerId)} className={LINK_CLASS}>
                {sellerName(product.sellerId) ?? COPY.seller}
              </Link>
            </Row>
            <Row label={COPY.category}>{category}</Row>
            <Row label={COPY.price}>{price}</Row>
            <Row label={COPY.published}>{dateOrNever(product.publishedAt)}</Row>
            <Row label={COPY.created}>{formatDateTime(product.createdAt)}</Row>
            <Row label={COPY.updated}>{formatDateTime(product.updatedAt)}</Row>
          </dl>
          <ul className="space-y-1 text-sm">
            {product.visible ? (
              <li>
                <a
                  href={`${publicEnv.NEXT_PUBLIC_STOREFRONT_URL}${STOREFRONT_PRODUCT_PATH(product.slug)}`}
                  className={LINK_CLASS}
                >
                  {COPY.viewInStore}
                </a>
              </li>
            ) : null}
            <li>
              <Link href={productReviewsPath(product.id)} className={LINK_CLASS}>
                {COPY.reviews}
              </Link>
            </li>
          </ul>
        </Section>
        <Section id="product-images" title={COPY.imagesHeading}>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">{COPY.noImages}</p>
          ) : (
            <ul aria-label={COPY.imagesLabel} className="grid grid-cols-3 gap-3">
              {images.map((image) => (
                <li key={image.id}>
                  <NileImage
                    image={image}
                    alt={imageAlt(image, product.name)}
                    sizes="(min-width: 1024px) 15vw, 33vw"
                    placeholder="product"
                    className="aspect-square w-full rounded-md bg-muted object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section id="product-description" title={COPY.description}>
        {/* Plain text from the seller: rendered as text, never as HTML (CLAUDE.md §7). */}
        <p className="text-sm whitespace-pre-line">{product.description}</p>
      </Section>
      <Section id="product-variants" title={COPY.variantsHeading}>
        <DataTable
          caption={COPY.variantsCaption}
          columns={variantColumns}
          rows={product.variants}
          getRowId={(variant) => variant.id}
          empty={null}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </Section>
      {dialog === 'block' ? (
        <BlockDialog
          product={product}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'unblock' ? (
        <UnblockDialog
          product={product}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Puts the answer in the cache, or reads the product again when it changed meanwhile. */
function useProductWrite(product: AdminProduct) {
  const queryClient = useQueryClient();
  const key = productKeys.detail(product.id);
  return {
    done: (updated: AdminProduct) => {
      queryClient.setQueryData(key, updated);
      // The seller's store listing on AD-05 changes with a block.
      void queryClient.invalidateQueries({ queryKey: productKeys.store(product.sellerId) });
    },
    /** `PRODUCT_BLOCK_INVALID_STATUS` / `PRODUCT_NOT_FOUND`: refetch and explain (spec 03 AD-27). */
    stale: (error: unknown): boolean => {
      if (!isApiError(error, 'PRODUCT_BLOCK_INVALID_STATUS') && !isApiError(error, 'PRODUCT_NOT_FOUND')) {
        return false;
      }
      void queryClient.invalidateQueries({ queryKey: key });
      toast({ title: COPY.changed, tone: 'destructive' });
      return true;
    },
  };
}

const blockSchema = z.object({ reason: fields.trimmedString(3, 500) });
type BlockValues = z.input<typeof blockSchema>;

function BlockDialog({ product, onClose }: { readonly product: AdminProduct; readonly onClose: () => void }) {
  const write = useProductWrite(product);
  const failure = useSubmitFailure();
  const form = useForm<BlockValues, unknown, z.output<typeof blockSchema>>({
    resolver: zodResolver(blockSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let reason: string | undefined;
    await form.handleSubmit((values) => {
      reason = values.reason;
    })();
    if (reason === undefined) throw new Error('invalid');
    try {
      write.done(await blockProduct(product.id, reason));
      toast({ title: COPY.blockedToast(product.name) });
    } catch (error) {
      if (write.stale(error)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.blockTitle}
      description={COPY.blockConfirm}
      confirmLabel={COPY.block}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the reason must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="reason"
          label={COPY.reason}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}

function UnblockDialog({
  product,
  onClose,
}: {
  readonly product: AdminProduct;
  readonly onClose: () => void;
}) {
  const write = useProductWrite(product);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.unblockTitle}
      description={COPY.unblockConfirm}
      confirmLabel={COPY.unblock}
      onConfirm={async () => {
        try {
          write.done(await unblockProduct(product.id));
          toast({ title: COPY.unblockedToast(product.name), tone: 'success' });
        } catch (error) {
          if (!write.stale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
        }
      }}
    />
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

'use client';

import { isApiError } from '@nile/api';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  LoadingRegion,
  LoadMore,
  Money,
  NileImage,
  PageHeader,
  RatingStars,
  Skeleton,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { browserApi } from '@/lib/browser-api';
import { productPath } from '@/lib/routes';
import { wishlistListOptions, type WishlistItem } from '../api';
import { WISHLIST_COPY } from '../copy';
import { useWishlistToggle } from '../hooks';

const CARD_IMAGE_SIZES = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';
const SKELETON_CARDS = 3;

function WishlistCard({ item }: { readonly item: WishlistItem }) {
  const { product } = item;
  const remove = useWishlistToggle();
  return (
    <article
      className={cn(
        'relative flex h-full flex-col gap-2 rounded-lg border border-border p-4',
        product.available
          ? 'focus-within:outline-2 focus-within:outline-ring hover:bg-muted/50'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <NileImage
        image={product.primaryImage}
        alt={product.name}
        sizes={CARD_IMAGE_SIZES}
        placeholder="product"
        className={cn(
          'aspect-square w-full rounded-md bg-muted',
          product.available ? '' : 'opacity-50 grayscale',
        )}
      />
      <h2 className="font-medium">
        {/* An unavailable product has no page to go to [SPEC 04 WL-2]: only "Remove". */}
        {product.available ? (
          <Link
            href={productPath(product.slug)}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {product.name}
          </Link>
        ) : (
          product.name
        )}
      </h2>
      {product.available && product.minPrice !== null ? (
        <Money
          value={product.minPrice}
          {...(product.maxPrice === null ? {} : { max: product.maxPrice })}
          className="font-semibold"
        />
      ) : null}
      {product.available && product.rating.count > 0 ? (
        <RatingStars avg={product.rating.avg} count={product.rating.count} />
      ) : null}
      {product.available ? (
        product.inStock ? null : (
          <Badge tone="neutral" className="self-start">
            {WISHLIST_COPY.outOfStock}
          </Badge>
        )
      ) : (
        <Badge tone="neutral" className="self-start">
          {WISHLIST_COPY.noLongerAvailable}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        className="relative z-10 mt-auto self-start"
        aria-label={WISHLIST_COPY.removeNamed(product.name)}
        loading={remove.isPending}
        onClick={() => {
          remove.mutate({ productId: item.productId, saved: false });
        }}
      >
        {WISHLIST_COPY.removeItem}
      </Button>
    </article>
  );
}

/** SF-23 Wishlist: saved products, 20 per page, newest first; unavailable ones greyed with only "Remove". */
export function WishlistView() {
  const wishlist = useInfiniteQuery(wishlistListOptions(browserApi));
  let body;
  if (wishlist.isPending) {
    body = (
      <LoadingRegion className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} className="h-72" />
        ))}
      </LoadingRegion>
    );
  } else if (wishlist.isError) {
    body = (
      <ErrorState
        message={WISHLIST_COPY.loadFailed}
        onRetry={() => void wishlist.refetch()}
        retrying={wishlist.isFetching}
        correlationId={isApiError(wishlist.error) ? (wishlist.error.correlationId ?? undefined) : undefined}
      />
    );
  } else {
    const items = wishlist.data.pages.flatMap((page) => page.data);
    body =
      items.length === 0 ? (
        <EmptyState title={WISHLIST_COPY.empty} />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.productId}>
                <WishlistCard item={item} />
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={wishlist.hasNextPage}
            loading={wishlist.isFetchingNextPage}
            loadedCount={items.length}
            onLoadMore={() => void wishlist.fetchNextPage()}
          />
        </>
      );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={WISHLIST_COPY.title} />
      {body}
    </div>
  );
}

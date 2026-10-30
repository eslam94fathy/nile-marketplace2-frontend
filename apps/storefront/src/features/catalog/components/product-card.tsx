import type { Schema } from '@nile/api';
import { Badge, Money, NileImage, RatingStars } from '@nile/ui';
import Link from 'next/link';
import { WishlistHeart } from '@/features/wishlist';
import { sellerPath } from '@/lib/routes';
import { CATALOG_COPY } from '../copy';
import { productHref } from '../lib/product-href';

export type ProductListItem = Schema<'ProductListItemDto'>;

/** Card image width per grid layout (one column, two from `sm`, three from `lg`). */
const CARD_IMAGE_SIZES = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';
/** Cards of the first row on the widest layout load their image eagerly (conventions §12.1). */
export const FIRST_ROW_CARDS = 3;

/**
 * Product card (spec 01 SF-04, §10.3): primary image (square crop) with the wishlist heart, name, price, category, rating (hidden
 * without reviews), seller. The whole card is one link target for the product (the name's link is stretched
 * over it); the seller link is a separate focusable link above it.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  readonly product: ProductListItem;
  readonly priority?: boolean;
}) {
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-lg border border-border p-4 focus-within:outline-2 focus-within:outline-ring hover:bg-muted/50">
      {/* `ImageDto` has no alt text of its own: the product name (conventions §12.1). */}
      <NileImage
        image={product.primaryImage}
        alt={product.name}
        sizes={CARD_IMAGE_SIZES}
        placeholder="product"
        priority={priority}
        className="aspect-square w-full rounded-md bg-muted"
      />
      <WishlistHeart productId={product.id} className="absolute end-6 top-6 z-10" />
      <h3 className="font-medium">
        <Link
          href={productHref(product.slug)}
          className="outline-none after:absolute after:inset-0 after:content-['']"
        >
          {product.name}
        </Link>
      </h3>
      <Money value={product.minPrice} max={product.maxPrice} className="font-semibold" />
      <p className="text-sm text-muted-foreground">{product.category.name}</p>
      {product.rating.count === 0 ? null : (
        <RatingStars avg={product.rating.avg} count={product.rating.count} />
      )}
      <p className="mt-auto text-sm">
        {CATALOG_COPY.soldBy}{' '}
        <Link
          href={sellerPath(product.seller.id)}
          className="relative z-10 text-primary underline-offset-4 hover:underline"
        >
          {product.seller.businessName}
        </Link>
      </p>
      {product.inStock ? null : (
        <Badge tone="neutral" className="self-start">
          {CATALOG_COPY.outOfStock}
        </Badge>
      )}
    </article>
  );
}

/**
 * A grid of product cards (shared by the listing and the home page's new arrivals). `priorityCount` cards
 * at the start load their image eagerly: set it where the grid is the top of the page.
 */
export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  readonly products: readonly ProductListItem[];
  readonly priorityCount?: number;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

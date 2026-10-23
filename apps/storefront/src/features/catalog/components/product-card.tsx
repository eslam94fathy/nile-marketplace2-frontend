import type { Schema } from '@nile/api';
import { Badge, Money } from '@nile/ui';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { CATALOG_COPY } from '../copy';
import { LISTING_PARAMS } from '../lib/listing-params';
import { productHref } from '../lib/product-href';

export type ProductListItem = Schema<'ProductListItemDto'>;

/**
 * Product card (spec 01 SF-04; no images in R1). The whole card is one link target for the product (the
 * name's link is stretched over it); the seller link is a separate focusable link above it.
 */
export function ProductCard({ product }: { readonly product: ProductListItem }) {
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-lg border border-border p-4 focus-within:outline-2 focus-within:outline-ring hover:bg-muted/50">
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
      <p className="mt-auto text-sm">
        {CATALOG_COPY.soldBy}{' '}
        <Link
          href={{ pathname: ROUTES.search, query: { [LISTING_PARAMS.seller]: product.seller.id } }}
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

/** A grid of product cards (shared by the listing and the home page's new arrivals). */
export function ProductGrid({ products }: { readonly products: readonly ProductListItem[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

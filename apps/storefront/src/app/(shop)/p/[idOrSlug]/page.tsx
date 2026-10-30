import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  Breadcrumbs,
  CATALOG_COPY,
  categoryHref,
  PRODUCT_PARAMS,
  productHref,
  ProductView,
  type ProductDetail,
} from '@/features/catalog';
import { getProduct } from '@/lib/server/catalog';

const META_DESCRIPTION_LENGTH = 160;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

async function loadProduct(idOrSlug: string): Promise<ProductDetail> {
  const product = await getProduct(idOrSlug);
  if (product === null) notFound();
  return product;
}

export async function generateMetadata({ params }: PageProps<'/p/[idOrSlug]'>): Promise<Metadata> {
  const product = await getProduct((await params).idOrSlug);
  if (product === null) return { title: CATALOG_COPY.productUnavailable };
  return {
    title: product.name,
    description: product.description.slice(0, META_DESCRIPTION_LENGTH),
    alternates: { canonical: productHref(product.slug) },
  };
}

/**
 * SF-05 Product detail, server-rendered without cache (stock and visibility are live). Reached by id (e.g.
 * from an order item) it redirects permanently to the slug URL, keeping the query.
 */
export default async function ProductPage({ params, searchParams }: PageProps<'/p/[idOrSlug]'>) {
  const { idOrSlug } = await params;
  const query = await searchParams;
  const product = await loadProduct(idOrSlug);
  if (UUID.test(idOrSlug) && idOrSlug !== product.slug) {
    const search = new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
    ).toString();
    permanentRedirect(search === '' ? productHref(product.slug) : `${productHref(product.slug)}?${search}`);
  }
  return (
    <article className="space-y-8">
      <Breadcrumbs
        links={product.category.path.map((category) => ({
          name: category.name,
          href: categoryHref(category.slug),
        }))}
        current={product.name}
      />
      <ProductView
        product={product}
        variantId={first(query[PRODUCT_PARAMS.variant])}
        quantity={first(query[PRODUCT_PARAMS.quantity])}
        heading={<h1 className="text-2xl font-semibold">{product.name}</h1>}
      />
      <section aria-labelledby="product-description" className="space-y-2">
        <h2 id="product-description" className="font-medium">
          {CATALOG_COPY.description}
        </h2>
        {/* Plain text from the seller: rendered as text, line breaks kept (CLAUDE.md §7). */}
        <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>
      </section>
    </article>
  );
}

'use client';

import { formatMoney, imageAlt, variantImage } from '@nile/domain';
import { Badge, Button, ImageGallery, Money, QuantityStepper, RatingStars } from '@nile/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { AddToCart } from '@/features/cart';
import { useHasSession } from '@/lib/use-has-session';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { CATALOG_COPY } from '../copy';
import { LISTING_PARAMS } from '../lib/listing-params';
import { PRODUCT_PARAMS } from '../lib/product-params';
import { productHref } from '../lib/product-href';
import {
  initialSelection,
  maxQuantity,
  optionState,
  parseQuantity,
  selectedVariant,
  type ProductDetail,
  type Selection,
} from '../lib/variant-selection';

const CHIP =
  'inline-flex min-h-10 cursor-pointer items-center rounded-md border border-input px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:border-dashed peer-disabled:text-muted-foreground peer-disabled:line-through';

/** Keeps `?variant=` in step with the selection without a navigation (no server round-trip per click). */
function replaceVariantInUrl(variantId: string | null): void {
  const url = new URL(window.location.href);
  if (variantId === null) url.searchParams.delete(PRODUCT_PARAMS.variant);
  else url.searchParams.set(PRODUCT_PARAMS.variant, variantId);
  url.searchParams.delete(PRODUCT_PARAMS.quantity);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function OptionGroup({
  product,
  attribute,
  selection,
  onSelect,
}: {
  readonly product: ProductDetail;
  readonly attribute: ProductDetail['attributes'][number];
  readonly selection: Selection;
  readonly onSelect: (attributeCode: string, optionCode: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{attribute.name}</legend>
      <div className="flex flex-wrap gap-2">
        {attribute.options.map((option) => {
          const state = optionState(product, selection, attribute.code, option.code);
          const id = `${name}-${option.code}`;
          return (
            <div key={option.code}>
              <input
                id={id}
                type="radio"
                name={name}
                className="peer sr-only"
                checked={selection[attribute.code] === option.code}
                disabled={state === 'unavailable'}
                onChange={() => {
                  onSelect(attribute.code, option.code);
                }}
              />
              <label htmlFor={id} className={CHIP}>
                {option.value}
                {state === 'outOfStock' ? (
                  <span className="ms-1 text-xs">({CATALOG_COPY.outOfStock})</span>
                ) : null}
                {state === 'unavailable' ? (
                  <span className="sr-only">: {CATALOG_COPY.notInThisCombination}</span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface ProductViewProps {
  readonly product: ProductDetail;
  /** `?variant=` from the URL. */
  readonly variantId: string | null;
  /** `?qty=` from the URL. */
  readonly quantity: string | null;
  /** The product name (`h1`), rendered from the server between the gallery and the purchase panel. */
  readonly heading: ReactNode;
}

/**
 * SF-05 interactive part: the gallery (follows the chosen variant's image, spec 01 §10.3), rating, price, variant picker, availability, quantity and the add-to-cart entry point
 * (signed out: sign-in with returnTo carrying variant and quantity, FQ-6; signed in: the cart, SF-05-A1).
 */
export function ProductView({ product, variantId, quantity: quantityParam, heading }: ProductViewProps) {
  const router = useRouter();
  const signedIn = useHasSession();
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product, variantId));
  const variant = selectedVariant(product, selection);
  const max = variant === null ? 1 : maxQuantity(variant);
  const [quantity, setQuantity] = useState(() => parseQuantity(quantityParam, max));
  const shownQuantity = Math.min(quantity, max);
  const complete = product.attributes.every((attribute) => Object.hasOwn(selection, attribute.code));
  const [photoId, setPhotoId] = useState(() => variantImage(product, variant?.id ?? null)?.id ?? null);
  const photos = product.images.map((image) => ({ ...image, alt: imageAlt(image, product.name) }));

  const select = (attributeCode: string, optionCode: string) => {
    const next = { ...selection, [attributeCode]: optionCode };
    setSelection(next);
    const nextVariant = selectedVariant(product, next);
    replaceVariantInUrl(nextVariant?.id ?? null);
    // A variant with its own image shows it; otherwise the photo the shopper is looking at stays [SPEC 06 §8.1].
    const imageId = nextVariant?.imageId ?? null;
    if (imageId !== null) setPhotoId(imageId);
  };

  const addToCart = () => {
    if (variant === null) return;
    const back = `${productHref(product.slug)}?${new URLSearchParams({
      [PRODUCT_PARAMS.variant]: variant.id,
      [PRODUCT_PARAMS.quantity]: String(shownQuantity),
    }).toString()}`;
    router.push(`${ROUTES.login}?${new URLSearchParams({ [RETURN_TO_PARAM]: back }).toString()}`);
  };

  const canAdd = variant?.inStock === true;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ImageGallery
        images={photos}
        activeId={photoId}
        onActiveChange={setPhotoId}
        name={product.name}
        className="lg:sticky lg:top-4 lg:self-start"
      />
      <div className="space-y-6">
        <div className="space-y-2">
          {heading}
          <RatingStars avg={product.rating.avg} count={product.rating.count} />
        </div>
        <div className="space-y-1">
          {variant === null ? (
            <Money value={product.minPrice} max={product.maxPrice} className="text-2xl font-semibold" />
          ) : (
            <p className="flex flex-wrap items-baseline gap-3">
              <Money value={variant.price} className="text-2xl font-semibold" />
              {variant.compareAtPrice === null ? null : (
                // Struck through on screen; read as "Was EGP …" (spec 01 SF-05, compare-at is always higher).
                <span className="text-muted-foreground">
                  <s aria-hidden="true">
                    <Money value={variant.compareAtPrice} />
                  </s>
                  <span className="sr-only">{CATALOG_COPY.was(formatMoney(variant.compareAtPrice))}</span>
                </span>
              )}
            </p>
          )}
          <p className="text-sm">
            {CATALOG_COPY.soldByLine}{' '}
            <Link
              href={{ pathname: ROUTES.search, query: { [LISTING_PARAMS.seller]: product.seller.id } }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {product.seller.businessName}
            </Link>
            {product.seller.ratingCount === 0 ? null : (
              <RatingStars
                avg={product.seller.ratingAvg}
                count={product.seller.ratingCount}
                className="ms-2 align-middle"
              />
            )}
          </p>
        </div>

        {product.attributes.map((attribute) => (
          <OptionGroup
            key={attribute.code}
            product={product}
            attribute={attribute}
            selection={selection}
            onSelect={select}
          />
        ))}

        <div role="status" className="text-sm">
          {variant !== null ? (
            <Badge tone={variant.inStock ? 'success' : 'neutral'}>
              {variant.inStock ? CATALOG_COPY.inStock : CATALOG_COPY.outOfStock}
            </Badge>
          ) : complete ? (
            <span className="text-destructive">{CATALOG_COPY.combinationUnavailable}</span>
          ) : (
            <span className="text-muted-foreground">{CATALOG_COPY.chooseOptions}</span>
          )}
        </div>

        {variant?.inStock === true ? (
          <QuantityStepper value={shownQuantity} max={max} onChange={setQuantity} />
        ) : null}

        {signedIn ? (
          <AddToCart
            variantId={variant?.inStock === true ? variant.id : null}
            quantity={shownQuantity}
            label={CATALOG_COPY.addToCart}
          />
        ) : (
          <Button size="lg" disabled={!canAdd} onClick={addToCart} className="w-full sm:w-auto">
            {CATALOG_COPY.addToCart}
          </Button>
        )}

        {variant === null ? null : (
          <section aria-labelledby="product-details" className="space-y-2">
            <h2 id="product-details" className="font-medium">
              {CATALOG_COPY.details}
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
              <dt className="text-muted-foreground">{CATALOG_COPY.sku}</dt>
              <dd>{variant.sku}</dd>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

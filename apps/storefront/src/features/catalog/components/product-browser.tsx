'use client';

import type { ProductQueryInput } from '@nile/api';
import { formatMoney } from '@nile/domain';
import { Button, Dialog, DialogContent, Label, Select } from '@nile/ui';
import { SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { CATALOG_COPY } from '../copy';
import {
  availableSorts,
  hasFilters,
  listingQueryString,
  type EffectiveAttribute,
  type ResolvedListing,
  type SortKey,
} from '../lib/listing-params';
import { CLEARED_FILTERS, FilterPanel, withAttribute, type ListingPatch } from './filter-panel';
import { ProductResults } from './product-results';

/** A category choice for the search page's refinement select (indented by depth). */
export interface CategoryOption {
  readonly slug: string;
  readonly name: string;
  readonly depth: number;
}

const ALL_CATEGORIES = '__all';
const INDENT = '  ';

export interface ProductBrowserProps {
  /** The listing the server resolved from the URL. */
  readonly listing: ResolvedListing;
  /** Its `GET /products` query (first page prefetched under the same key). */
  readonly query: ProductQueryInput;
  /** The page the listing lives on (`/search`, `/c/<slug>` or the seller page `/s/<id>`). */
  readonly basePath: '/search' | `/c/${string}` | `/s/${string}`;
  readonly attributes: readonly EffectiveAttribute[] | null;
  /** Search page only: the category refinement (spec 01 SF-03). */
  readonly categoryOptions?: readonly CategoryOption[];
}

interface Chip {
  readonly key: string;
  readonly label: string;
  readonly patch: ListingPatch;
}

function priceLabel(min: string | null, max: string | null): string | null {
  if (min !== null && max !== null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  if (min !== null) return CATALOG_COPY.priceFrom(formatMoney(min));
  if (max !== null) return CATALOG_COPY.priceUpTo(formatMoney(max));
  return null;
}

function activeChips(listing: ResolvedListing, attributes: readonly EffectiveAttribute[] | null): Chip[] {
  const chips: Chip[] = [];
  const price = priceLabel(listing.minPrice, listing.maxPrice);
  if (price !== null) chips.push({ key: 'price', label: price, patch: { minPrice: null, maxPrice: null } });
  if (listing.inStock) chips.push({ key: 'stock', label: CATALOG_COPY.inStock, patch: { inStock: false } });
  if (listing.rating !== null) {
    chips.push({ key: 'rating', label: CATALOG_COPY.starsAndUp(listing.rating), patch: { rating: null } });
  }
  for (const attribute of attributes ?? []) {
    const selected = listing.attributes[attribute.code] ?? [];
    for (const option of attribute.options.filter((o) => selected.includes(o.code))) {
      const rest = selected.filter((code) => code !== option.code);
      chips.push({
        key: `${attribute.code}:${option.code}`,
        label: `${attribute.name}: ${option.value}`,
        patch: { attributes: withAttribute(listing.attributes, attribute.code, rest) },
      });
    }
  }
  return chips;
}

/**
 * Listing page body (spec 01 SF-03, SF-04): sort, category refinement (search), filters (sidebar on desktop,
 * sheet on phones), active-filter chips, results. Every change navigates to the canonical URL, so Back and
 * Forward restore filters; the transition keeps the previous results (dimmed) until the new page arrives.
 */
export function ProductBrowser({
  listing,
  query,
  basePath,
  attributes,
  categoryOptions,
}: ProductBrowserProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sortId = useId();
  const categoryId = useId();

  const go = (next: Omit<ResolvedListing, 'categoryId'>) => {
    // The seller page is the seller: like a route category, it is not repeated in the URL.
    const search = listingQueryString(basePath.startsWith('/s/') ? { ...next, seller: null } : next);
    startTransition(() => {
      router.push(search === '' ? basePath : `${basePath}?${search}`, { scroll: false });
    });
  };
  const change = (patch: ListingPatch) => {
    go({ ...listing, ...patch });
  };
  const clearFilters = () => {
    change(CLEARED_FILTERS);
  };
  const resetToDefaults = () => {
    go({
      ...listing,
      ...CLEARED_FILTERS,
      sort: listing.q === null ? 'newest' : 'best-match',
    });
  };

  const chips = activeChips(listing, attributes);
  const panel = <FilterPanel listing={listing} attributes={attributes} onChange={change} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {categoryOptions === undefined ? null : (
          <div className="space-y-1">
            <Label htmlFor={categoryId}>{CATALOG_COPY.categoryRefinement}</Label>
            <Select
              id={categoryId}
              className="min-w-48"
              value={listing.categorySlug ?? ALL_CATEGORIES}
              onValueChange={(slug) => {
                // Attribute filters belong to the previous category (spec 01 SF-03).
                change({ categorySlug: slug === ALL_CATEGORIES ? null : slug, attributes: {} });
              }}
              options={[
                { value: ALL_CATEGORIES, label: CATALOG_COPY.allCategories },
                ...categoryOptions.map((option) => ({
                  value: option.slug,
                  label: `${INDENT.repeat(option.depth)}${option.name}`,
                })),
              ]}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={sortId}>{CATALOG_COPY.sortLabel}</Label>
          <Select
            id={sortId}
            className="min-w-48"
            value={listing.sort}
            onValueChange={(sort) => {
              change({ sort: sort as SortKey });
            }}
            options={availableSorts(listing.q).map((key) => ({ value: key, label: CATALOG_COPY.sorts[key] }))}
          />
        </div>
        <Button
          variant="outline"
          className="lg:hidden"
          aria-expanded={filtersOpen}
          onClick={() => {
            setFiltersOpen(true);
          }}
        >
          <SlidersHorizontal aria-hidden="true" />
          {CATALOG_COPY.showFilters}
        </Button>
      </div>

      {chips.length === 0 ? null : (
        <ul aria-label={CATALOG_COPY.activeFilters} className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Button
                variant="secondary"
                size="sm"
                aria-label={CATALOG_COPY.remove(chip.label)}
                onClick={() => {
                  change(chip.patch);
                }}
              >
                {chip.label}
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside aria-label={CATALOG_COPY.filters} className="hidden lg:block">
          {panel}
        </aside>
        <section aria-label={CATALOG_COPY.products}>
          <ProductResults
            query={query}
            updating={pending}
            filtersSet={hasFilters(listing)}
            onClearFilters={clearFilters}
            onReset={resetToDefaults}
          />
        </section>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent title={CATALOG_COPY.filters} placement="bottom">
          {panel}
        </DialogContent>
      </Dialog>
    </div>
  );
}

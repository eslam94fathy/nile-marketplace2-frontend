'use client';

import { fields } from '@nile/domain';
import { Button, Checkbox, Input, Label } from '@nile/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { CATALOG_COPY } from '../copy';
import {
  hasFilters,
  RATING_FILTERS,
  type EffectiveAttribute,
  type ResolvedListing,
} from '../lib/listing-params';

/** `attributes` with `code` set to `values`, or without `code` when `values` is empty. */
export function withAttribute(
  attributes: Readonly<Record<string, readonly string[]>>,
  code: string,
  values: readonly string[],
): Record<string, readonly string[]> {
  const rest = Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== code));
  return values.length === 0 ? rest : { ...rest, [code]: values };
}

export type ListingPatch = Partial<
  Pick<
    ResolvedListing,
    'minPrice' | 'maxPrice' | 'inStock' | 'rating' | 'attributes' | 'categorySlug' | 'sort'
  >
>;

/** Every filter off ("Clear all"); search text, category, seller and sort stay. */
export const CLEARED_FILTERS = {
  minPrice: null,
  maxPrice: null,
  inStock: false,
  rating: null,
  attributes: {},
} as const satisfies ListingPatch;

export interface FilterPanelProps {
  readonly listing: ResolvedListing;
  /** The category's attributes; null without a category (no facets, spec 01 SF-03). */
  readonly attributes: readonly EffectiveAttribute[] | null;
  readonly onChange: (patch: ListingPatch) => void;
}

function PriceFilter({ listing, onChange }: Pick<FilterPanelProps, 'listing' | 'onChange'>) {
  const [min, setMin] = useState(listing.minPrice ?? '');
  const [max, setMax] = useState(listing.maxPrice ?? '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const minId = useId();
  const maxId = useId();
  const noteId = useId();

  const apply = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [lo, hi] = [min.trim(), max.trim()];
    const valid = (value: string) => value === '' || fields.MONEY_PATTERN.test(value);
    if (!valid(lo) || !valid(hi)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    // The URL parser swaps min and max when needed (spec 01 SF-04).
    onChange({ minPrice: lo === '' ? null : lo, maxPrice: hi === '' ? null : hi });
  };

  const describedBy = [noteId, invalid ? errorId : null].filter(Boolean).join(' ');
  return (
    <form onSubmit={apply} className="space-y-2" aria-label={CATALOG_COPY.price}>
      <fieldset className="space-y-2">
        <legend className="font-medium">{CATALOG_COPY.price}</legend>
        <p id={noteId} className="text-xs text-muted-foreground">
          {CATALOG_COPY.priceNote}
        </p>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor={minId}>{CATALOG_COPY.min}</Label>
            <Input
              id={minId}
              inputMode="decimal"
              value={min}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => {
                setMin(event.target.value);
              }}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor={maxId}>{CATALOG_COPY.max}</Label>
            <Input
              id={maxId}
              inputMode="decimal"
              value={max}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => {
                setMax(event.target.value);
              }}
            />
          </div>
        </div>
        {invalid ? (
          <p id={errorId} className="text-sm text-destructive">
            {CATALOG_COPY.priceInvalid}
          </p>
        ) : null}
      </fieldset>
      <Button type="submit" variant="outline" size="sm">
        {CATALOG_COPY.apply}
      </Button>
    </form>
  );
}

/** "Rating": 4 stars & up, 3 stars & up, Any (spec 01 §10.3). */
function RatingFilter({ listing, onChange }: Pick<FilterPanelProps, 'listing' | 'onChange'>) {
  const name = useId();
  const choices = [
    ...RATING_FILTERS.map((stars) => ({ value: stars, label: CATALOG_COPY.starsAndUp(stars) })),
    { value: null, label: CATALOG_COPY.anyRating },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{CATALOG_COPY.rating}</legend>
      {choices.map((choice) => {
        const id = `${name}-${String(choice.value ?? 'any')}`;
        return (
          <div key={id} className="flex items-center gap-2">
            <input
              id={id}
              type="radio"
              name={name}
              className="size-4 accent-primary"
              checked={listing.rating === choice.value}
              onChange={() => {
                onChange({ rating: choice.value });
              }}
            />
            <Label htmlFor={id} className="font-normal">
              {choice.label}
            </Label>
          </div>
        );
      })}
    </fieldset>
  );
}

function CheckboxRow({
  label,
  checked,
  onCheckedChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => {
          onCheckedChange(value === true);
        }}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Filter panel (spec 01 SF-04, §10.3): price, in stock, rating, one group per attribute (with a category), clear all. */
export function FilterPanel({ listing, attributes, onChange }: FilterPanelProps) {
  const toggleOption = (code: string, option: string, checked: boolean) => {
    const current = Object.hasOwn(listing.attributes, code) ? (listing.attributes[code] ?? []) : [];
    const values = checked ? [...current, option] : current.filter((value) => value !== option);
    onChange({ attributes: withAttribute(listing.attributes, code, values) });
  };

  return (
    <div className="space-y-6">
      {/* Re-mounted when the URL's prices change (e.g. a chip removed), so the inputs show the URL's values. */}
      <PriceFilter
        key={`${listing.minPrice ?? ''}-${listing.maxPrice ?? ''}`}
        listing={listing}
        onChange={onChange}
      />
      <CheckboxRow
        label={CATALOG_COPY.inStockOnly}
        checked={listing.inStock}
        onCheckedChange={(inStock) => {
          onChange({ inStock });
        }}
      />
      <RatingFilter listing={listing} onChange={onChange} />
      {(attributes ?? []).map((attribute) => (
        <fieldset key={attribute.id} className="space-y-2">
          <legend className="font-medium">{attribute.name}</legend>
          {attribute.options.map((option) => (
            <CheckboxRow
              key={option.id}
              label={option.value}
              checked={listing.attributes[attribute.code]?.includes(option.code) ?? false}
              onCheckedChange={(checked) => {
                toggleOption(attribute.code, option.code, checked);
              }}
            />
          ))}
        </fieldset>
      ))}
      {hasFilters(listing) ? (
        <Button
          variant="link"
          className="px-0"
          onClick={() => {
            onChange(CLEARED_FILTERS);
          }}
        >
          {CATALOG_COPY.clearAll}
        </Button>
      ) : null}
    </div>
  );
}

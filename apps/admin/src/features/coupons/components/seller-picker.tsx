'use client';

import { unwrap } from '@nile/api';
import { queryKey } from '@nile/query';
import { Button, Input, Label, Skeleton, UI_COPY } from '@nile/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useSellerNames } from '@/features/lookups';
import { browserApi } from '@/lib/browser-api';
import { COUPONS_COPY } from '../copy';

// "One seller" on AD-36 / AD-37 (AD-Q-15): the AD-21 payee search pattern (search field, result list, "Choose";
// no Combobox dependency): sellers by business name, matched on the server (`[like]`), the first 10.

const COPY = COUPONS_COPY.sellerSearch;
/** As the other admin name searches (AD-04, AD-21): the search waits for a pause in typing. */
const SEARCH_DEBOUNCE_MS = 400;
const RESULTS_LIMIT = 10;
const SEARCH_MAX = 150;

function sellerSearchQuery(term: string) {
  return queryOptions({
    queryKey: queryKey('admin', 'coupons', 'sellerSearch', { term }),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/sellers', {
            params: { query: { limit: RESULTS_LIMIT, sort: '-createdAt', 'businessName[like]': term } },
            signal,
          }),
        )
      ).data.map((seller) => ({ id: seller.id, name: seller.businessName })),
    staleTime: 0,
  });
}

export interface SellerPickerProps {
  /** The chosen seller id, `''` while none is chosen. */
  readonly value: string;
  readonly onChange: (sellerId: string) => void;
  readonly disabled?: boolean;
  readonly error: string | undefined;
}

export function SellerPicker({ value, onChange, disabled = false, error }: SellerPickerProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(text.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const sellerName = useSellerNames([value === '' ? null : value]);
  const results = useQuery({ ...sellerSearchQuery(term), enabled: value === '' && term !== '' });
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const errorText =
    error === undefined ? null : (
      <p id={errorId} className="text-sm text-destructive" role={value === '' ? undefined : 'alert'}>
        {error}
      </p>
    );

  if (value !== '') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">{COUPONS_COPY.fields.seller}</p>
        <div className="space-y-1 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">{sellerName(value) ?? COUPONS_COPY.shortId(value)}</p>
          {disabled ? null : (
            <Button
              variant="link"
              className="h-auto px-0"
              onClick={() => {
                onChange('');
              }}
            >
              {COPY.change}
            </Button>
          )}
        </div>
        {errorText}
      </div>
    );
  }

  let body = null;
  if (term === '') body = null;
  else if (results.isError) body = <p className="text-sm text-destructive">{COPY.failed}</p>;
  else if (results.data === undefined) body = <Skeleton className="h-16" />;
  else if (results.data.length === 0)
    body = <p className="text-sm text-muted-foreground">{COPY.noMatches}</p>;
  else {
    body = (
      <ul aria-label={COPY.results} className="divide-y divide-border rounded-md border border-border">
        {results.data.map((result) => (
          <li key={result.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{result.name}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label={COPY.chooseName(result.name)}
              onClick={() => {
                onChange(result.id);
              }}
            >
              {COPY.choose}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>
        {COUPONS_COPY.fields.seller}
        <span className="sr-only"> {UI_COPY.required}</span>
      </Label>
      <p id={hintId} className="text-xs text-muted-foreground">
        {COUPONS_COPY.fields.searchSellers}
      </p>
      <Input
        id={`${id}-search`}
        type="search"
        value={text}
        maxLength={SEARCH_MAX}
        disabled={disabled}
        aria-required
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? hintId : `${hintId} ${errorId}`}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {errorText}
      <div aria-live="polite">{body}</div>
    </div>
  );
}

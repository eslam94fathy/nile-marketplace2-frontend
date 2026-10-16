'use client';

import { unwrap } from '@nile/api';
import { formatMoney, moneyGreaterThan } from '@nile/domain';
import { queryKey } from '@nile/query';
import { Button, Input, Label, Skeleton, UI_COPY } from '@nile/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { browserApi } from '@/lib/browser-api';
import { FINANCE_COPY as COPY } from '../copy';
import type { PayeeType } from '../lib/params';

// AD-21 payee search (decided 2026-10-16: search field + result list, no Combobox dependency): sellers by
// business name, agents by full name, matched on the server (`[like]`), the first 10 results.

/** As the other admin name searches (AD-04, AD-09): the search waits for a pause in typing. */
export const PAYEE_SEARCH_DEBOUNCE_MS = 400;
const RESULTS_LIMIT = 10;
const SEARCH_MAX = 150;
const ZERO = '0.00';

export interface Payee {
  readonly id: string;
  readonly name: string;
}

function payeeSearchQuery(payeeType: PayeeType, term: string) {
  return queryOptions({
    queryKey: queryKey('admin', 'payees', 'search', { payeeType, term }),
    queryFn: async ({ signal }): Promise<Payee[]> => {
      if (payeeType === 'seller') {
        const { data } = await unwrap(
          browserApi.GET('/api/v1/admin/sellers', {
            params: { query: { limit: RESULTS_LIMIT, sort: '-createdAt', 'businessName[like]': term } },
            signal,
          }),
        );
        return data.map((seller) => ({ id: seller.id, name: seller.businessName }));
      }
      const { data } = await unwrap(
        browserApi.GET('/api/v1/admin/delivery-agents', {
          params: { query: { limit: RESULTS_LIMIT, sort: '-createdAt', 'fullName[like]': term } },
          signal,
        }),
      );
      return data.map((agent) => ({ id: agent.id, name: agent.fullName }));
    },
    staleTime: 0,
  });
}

export interface PayeePickerProps {
  readonly payeeType: PayeeType;
  readonly payee: Payee | null;
  /** What Nile owes the chosen payee; null while unknown. */
  readonly owed: string | null;
  readonly owedLoading: boolean;
  readonly error: string | undefined;
  readonly onChange: (payee: Payee | null) => void;
}

/** The chosen payee with what Nile owes them and "Change payee", or a search with "Choose" per result. */
export function PayeePicker({ payeeType, payee, owed, owedLoading, error, onChange }: PayeePickerProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(text.trim());
    }, PAYEE_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const results = useQuery({ ...payeeSearchQuery(payeeType, term), enabled: payee === null && term !== '' });
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  if (payee !== null) {
    return (
      <div className="space-y-1 rounded-md border border-border p-3 text-sm">
        <p className="font-medium">{COPY.payeeName(COPY.payeeTypeLabels[payeeType], payee.name)}</p>
        {owedLoading || owed === null ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <p aria-live="polite">
            {moneyGreaterThan(owed, ZERO) ? COPY.owed(formatMoney(owed)) : COPY.owedNothing}
          </p>
        )}
        <Button
          variant="link"
          className="h-auto px-0"
          onClick={() => {
            onChange(null);
          }}
        >
          {COPY.change}
        </Button>
        {error === undefined ? null : (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  let body = null;
  if (term === '') body = <p className="text-sm text-muted-foreground">{COPY.searchHint}</p>;
  else if (results.isError) body = <p className="text-sm text-destructive">{COPY.searchFailed}</p>;
  else if (results.data === undefined) body = <Skeleton className="h-16" />;
  else if (results.data.length === 0)
    body = <p className="text-sm text-muted-foreground">{COPY.noMatches}</p>;
  else {
    body = (
      <ul aria-label={COPY.searchResults} className="divide-y divide-border rounded-md border border-border">
        {results.data.map((result) => (
          <li key={result.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{result.name}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label={COPY.chooseName(result.name)}
              onClick={() => {
                onChange(result);
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
        {COPY.payee}
        <span className="sr-only"> {UI_COPY.required}</span>
      </Label>
      <p id={hintId} className="text-xs text-muted-foreground">
        {payeeType === 'seller' ? COPY.searchSellers : COPY.searchAgents}
      </p>
      <Input
        id={`${id}-search`}
        type="search"
        value={text}
        maxLength={SEARCH_MAX}
        aria-required
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? hintId : `${hintId} ${errorId}`}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div aria-live="polite">{body}</div>
    </div>
  );
}

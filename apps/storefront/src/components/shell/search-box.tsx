'use client';

import { Button, cn, Input } from '@nile/ui';
import { Search } from 'lucide-react';
import Form from 'next/form';
import { useId, useState } from 'react';
import { ROUTES, SEARCH_PARAM } from '@/lib/routes';

// Header search (spec 01 §2.2): submits to /search?q=<text>; the text is trimmed, 2..100 characters
// [VERIFIED `q` 2..100]. Below 2 the submit is disabled with a hint; the input stops at 100.
const MIN_LENGTH = 2;
const MAX_LENGTH = 100;
const HINT = `Type at least ${MIN_LENGTH} characters`;
const LABEL = 'Search products';
const SUBMIT = 'Search';
/** Landmark names: every `search` landmark on a page needs its own (WCAG, axe `landmark-unique`). */
export const SEARCH_LANDMARKS = { header: 'Site search', home: 'Product search' } as const;

export interface SearchBoxProps {
  readonly className?: string;
  readonly landmarkLabel?: string;
  /** The home page's large search box (spec 01 SF-01). */
  readonly large?: boolean;
}

export function SearchBox({
  className,
  landmarkLabel = SEARCH_LANDMARKS.header,
  large = false,
}: SearchBoxProps) {
  const [text, setText] = useState('');
  const hintId = useId();
  const query = text.trim();
  const tooShort = query.length < MIN_LENGTH;

  return (
    <Form
      action={ROUTES.search}
      role="search"
      aria-label={landmarkLabel}
      className={cn('flex items-start gap-2', className)}
    >
      <div className="flex-1">
        <Input
          type="search"
          aria-label={LABEL}
          placeholder={LABEL}
          maxLength={MAX_LENGTH}
          className={large ? 'h-12 text-base' : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          aria-describedby={tooShort && text !== '' ? hintId : undefined}
        />
        {/* The trimmed value is what the URL carries; the visible field keeps what the shopper typed. */}
        <input type="hidden" name={SEARCH_PARAM} value={query} />
        {tooShort && text !== '' ? (
          <p id={hintId} className="mt-1 text-xs text-muted-foreground">
            {HINT}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        size="icon"
        aria-label={SUBMIT}
        disabled={tooShort}
        className={large ? 'size-12' : undefined}
      >
        <Search aria-hidden="true" />
      </Button>
    </Form>
  );
}

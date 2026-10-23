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
/** The search landmark's name. */
const LANDMARK_LABEL = 'Site search';

export function SearchBox({ className }: { readonly className?: string }) {
  const [text, setText] = useState('');
  const hintId = useId();
  const query = text.trim();
  const tooShort = query.length < MIN_LENGTH;

  return (
    <Form
      action={ROUTES.search}
      role="search"
      aria-label={LANDMARK_LABEL}
      className={cn('flex items-start gap-2', className)}
    >
      <div className="flex-1">
        <Input
          type="search"
          aria-label={LABEL}
          placeholder={LABEL}
          maxLength={MAX_LENGTH}
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
      <Button type="submit" size="icon" aria-label={SUBMIT} disabled={tooShort}>
        <Search aria-hidden="true" />
      </Button>
    </Form>
  );
}

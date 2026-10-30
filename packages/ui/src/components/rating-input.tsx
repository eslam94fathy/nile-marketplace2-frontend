'use client';

import { MAX_RATING } from '@nile/domain';
import { CircleAlert, Star } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';

// Rating input (conventions §12.8): a radio group of five labelled options "1 star" … "5 stars", operated with the
// arrow keys (native radios), required. The stars up to the choice are filled; the label text is for assistive
// technology, the stars are decorative.

export interface RatingInputProps {
  readonly legend: string;
  readonly value: number | null;
  readonly onChange: (rating: number) => void;
  readonly onBlur?: () => void;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
}

const VALUES = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

export function RatingInput({
  legend,
  value,
  onChange,
  onBlur,
  error,
  required = false,
  disabled = false,
  name,
}: RatingInputProps) {
  const id = useId();
  const groupName = name ?? id;
  const errorId = `${id}-error`;
  return (
    <fieldset
      className="space-y-1.5"
      aria-invalid={error !== undefined}
      {...(error === undefined ? {} : { 'aria-describedby': errorId })}
    >
      <legend className="text-sm font-medium">
        {legend}
        {required ? <span className="sr-only"> {UI_COPY.required}</span> : null}
      </legend>
      <div className="flex gap-1">
        {VALUES.map((rating) => {
          const optionId = `${id}-${String(rating)}`;
          const filled = value !== null && rating <= value;
          return (
            <div key={rating}>
              <input
                id={optionId}
                type="radio"
                name={groupName}
                value={rating}
                className="peer sr-only"
                checked={value === rating}
                disabled={disabled}
                required={required}
                onChange={() => {
                  onChange(rating);
                }}
                {...(onBlur === undefined ? {} : { onBlur })}
              />
              <label
                htmlFor={optionId}
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed hover:bg-muted"
              >
                <Star
                  aria-hidden="true"
                  className={cn('size-7', filled ? 'fill-nile-gold text-nile-gold' : 'text-slate-400')}
                />
                <span className="sr-only">{UI_COPY.stars(rating)}</span>
              </label>
            </div>
          );
        })}
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

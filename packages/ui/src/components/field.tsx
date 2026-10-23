'use client';

import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  useController,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Label } from './label';

/** The accessibility attributes the form control must spread (conventions §5). */
export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': boolean;
  readonly 'aria-required': boolean | undefined;
}

export interface FieldProps<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Transformed extends FieldValues = Values,
> {
  /** The form's control; `Transformed` is the resolver's output (e.g. an empty input becoming `null`). */
  readonly control: Control<Values, unknown, Transformed>;
  readonly name: Name;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
  /** `stacked`: label above (text inputs). `inline`: control then label on one line (checkbox, switch). */
  readonly layout?: 'stacked' | 'inline';
  readonly className?: string;
  readonly render: (props: {
    readonly field: ControllerRenderProps<Values, Name>;
    readonly fieldState: ControllerFieldState;
    readonly controlProps: FieldControlProps;
  }) => ReactNode;
}

/**
 * A React Hook Form field: label, optional description, the control, and the error message under it.
 * The message is linked with `aria-describedby` and the control gets `aria-invalid`, so screen readers
 * announce both (conventions §5). Server errors set with `form.setError` show here the same way.
 */
export function Field<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Transformed extends FieldValues = Values,
>({
  control,
  name,
  label,
  description,
  required = false,
  layout = 'stacked',
  className,
  render,
}: FieldProps<Values, Name, Transformed>) {
  const { field, fieldState } = useController({ control, name });
  const id = useId();
  const descriptionId = description === undefined ? undefined : `${id}-description`;
  const error = fieldState.error?.message;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error !== undefined,
    'aria-required': required || undefined,
  };

  const labelElement = (
    <Label htmlFor={id}>
      {label}
      {required ? <span className="sr-only"> {UI_COPY.required}</span> : null}
    </Label>
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      {layout === 'inline' ? (
        <div className="flex items-center gap-2">
          {render({ field, fieldState, controlProps })}
          {labelElement}
        </div>
      ) : (
        <>
          {labelElement}
          {render({ field, fieldState, controlProps })}
        </>
      )}
      {description === undefined ? null : (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export interface FormAlertProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly correlationId?: string | undefined;
  readonly className?: string;
}

/** Form-level error (unmatched validation details, mapped API errors). Announced at once (`role="alert"`). */
export function FormAlert({ title, children, correlationId, className }: FormAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border border-destructive bg-destructive-muted p-3 text-sm text-destructive',
        className,
      )}
    >
      {title === undefined ? null : <p className="font-medium">{title}</p>}
      <div>{children}</div>
      {correlationId === undefined ? null : (
        <p className="mt-1 text-xs">{UI_COPY.reference(correlationId)}</p>
      )}
    </div>
  );
}

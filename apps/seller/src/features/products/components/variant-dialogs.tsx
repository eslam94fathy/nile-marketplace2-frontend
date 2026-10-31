'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { VARIANT_STATUS_LABELS, VARIANT_STATUSES, fields } from '@nile/domain';
import { applyServerErrors, publicKeys } from '@nile/query';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  FormAlert,
  Input,
  Select,
  toast,
} from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import type * as z from 'zod';
import { useNotApprovedHandler } from '@/features/profile';
import {
  createVariant,
  productKeys,
  updateVariant,
  type EffectiveAttribute,
  type SellerProduct,
  type SellerVariant,
} from '../api';
import { PRODUCTS_COPY } from '../copy';
import { useProductBlockedHandler } from './product-blocked';
import {
  attributesWithProblems,
  isLastActiveVariant,
  takenCombinations,
  takenOptionIds,
  variantOptionsLabel,
} from '../lib/variants';
import {
  createVariantSchema,
  editVariantSchema,
  editVariantValues,
  emptyVariantValues,
  toCreateVariantBody,
  variantHasChanges,
  variantPatch,
  type CreateVariantSchema,
  type CreateVariantValues,
  type EditVariantValues,
} from '../schemas';

const COPY = PRODUCTS_COPY.variant;

const STATUS_OPTIONS = VARIANT_STATUSES.map((status) => ({
  value: status,
  label: VARIANT_STATUS_LABELS[status],
}));

const VARIANT_FIELD_MAP = {
  sku: { field: 'sku', message: COPY.skuPattern },
  price: { field: 'price', message: fields.FIELD_MESSAGES.positiveMoney },
  compareAtPrice: { field: 'compareAtPrice', message: fields.FIELD_MESSAGES.money },
  status: { field: 'status', message: fields.FIELD_MESSAGES.required },
} as const;

/** Product and lists follow a variant change: the answer is only the variant (design 02 §3.3). */
function useRefreshProduct(productId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };
}

// ── Create ────────────────────────────────────────────────────────────────────────────────────────────

export interface CreateVariantDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly product: SellerProduct;
  /** The category's effective attributes in API order (own and inherited). */
  readonly attributes: readonly EffectiveAttribute[];
}

/** SE-11 create: one select per attribute, "Save" or "Save and add another" (SE-Q-4). */
export function CreateVariantDialog({ open, onOpenChange, product, attributes }: CreateVariantDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={COPY.createTitle} className="sm:max-w-2xl">
        {/* Mounted only while open: every opening starts from an empty form. */}
        {open ? (
          <CreateVariantForm
            product={product}
            attributes={attributes}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateVariantForm({
  product,
  attributes,
  onDone,
}: {
  readonly product: SellerProduct;
  readonly attributes: readonly EffectiveAttribute[];
  readonly onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [alert, setAlert] = useState<string | null>(null);
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);
  const refreshProduct = useRefreshProduct(product.id);
  const taken = useMemo(() => takenCombinations(product.variants), [product.variants]);
  const schema = useMemo(() => createVariantSchema(attributes, taken), [attributes, taken]);
  const form = useForm<CreateVariantValues, unknown, z.output<CreateVariantSchema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: emptyVariantValues(attributes),
  });
  const selection = useWatch({ control: form.control, name: 'options' });
  const [another, setAnother] = useState(false);

  const optionError = (attributeId: string, message: string) => {
    form.setError(`options.${attributeId}` as FieldPath<CreateVariantValues>, { type: 'server', message });
  };

  const submit = (addAnother: boolean) =>
    form.handleSubmit(async (values) => {
      failure.clear();
      setAlert(null);
      try {
        await createVariant(product.id, toCreateVariantBody(values, attributes));
        refreshProduct();
        toast({ title: COPY.created, tone: 'success' });
        if (addAnother) form.reset(emptyVariantValues(attributes));
        else onDone();
      } catch (error) {
        if (handleNotApproved(error) || handleBlocked(error)) return;
        if (isApiError(error, 'VARIANT_OPTIONS_INVALID')) {
          // The category's options changed since the form loaded: reload them and ask again.
          void queryClient.invalidateQueries({ queryKey: publicKeys.categoryAttributes(product.categoryId) });
          for (const id of attributesWithProblems(error.details, attributes)) {
            optionError(id, COPY.errors.VARIANT_OPTIONS_INVALID);
          }
          setAlert(COPY.errors.VARIANT_OPTIONS_INVALID);
          return;
        }
        if (isApiError(error, 'VARIANT_COMBINATION_EXISTS')) {
          refreshProduct();
          setAlert(COPY.errors.VARIANT_COMBINATION_EXISTS);
          return;
        }
        if (isApiError(error, 'DEFAULT_VARIANT_EXISTS')) {
          refreshProduct();
          setAlert(COPY.errors.DEFAULT_VARIANT_EXISTS);
          return;
        }
        if (isApiError(error, 'VARIANT_LIMIT_REACHED')) {
          setAlert(COPY.errors.VARIANT_LIMIT_REACHED);
          return;
        }
        if (isApiError(error, 'SKU_TAKEN')) {
          form.setError('sku', { type: 'server', message: COPY.errors.SKU_TAKEN });
          return;
        }
        if (isApiError(error, 'COMPARE_AT_PRICE_INVALID')) {
          form.setError('compareAtPrice', { type: 'server', message: COPY.compareAtInvalid });
          return;
        }
        if (isApiError(error, 'PRODUCT_NOT_FOUND')) {
          // Deleted meanwhile: the page shows "not found" once refetched.
          refreshProduct();
          onDone();
          return;
        }
        if (!applyServerErrors(error, form.setError, VARIANT_FIELD_MAP)) failure.fail(error);
      }
    });

  // The combination error sits on `options` itself; RHF types that key as the record of per-attribute errors.
  const combinationError: unknown = (form.formState.errors.options as { message?: unknown } | undefined)
    ?.message;
  const optionsError = typeof combinationError === 'string' ? combinationError : undefined;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        // Enter and "Save" submit; "Save and add another" calls `submit(true)` itself.
        setAnother(false);
        void submit(false)(event);
      }}
    >
      {alert === null ? null : <FormAlert>{alert}</FormAlert>}
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{PRODUCTS_COPY.noOptions}</p>
      ) : (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          {attributes.map((attribute) => {
            const disabled = takenOptionIds(attributes, selection, attribute.id, taken);
            return (
              <Field
                key={attribute.id}
                control={form.control}
                name={`options.${attribute.id}` as FieldPath<CreateVariantValues>}
                label={attribute.name}
                required
                render={({ field, controlProps }) => (
                  <Select
                    {...controlProps}
                    options={attribute.options.map((option) => ({
                      value: option.id,
                      label: disabled.has(option.id) ? COPY.alreadyExists(option.value) : option.value,
                      disabled: disabled.has(option.id),
                    }))}
                    placeholder={COPY.optionPlaceholder(attribute.name)}
                    value={typeof field.value === 'string' ? field.value : ''}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            );
          })}
          {optionsError === undefined ? null : (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {optionsError}
            </p>
          )}
        </fieldset>
      )}
      {/* The create form has the same three fields with the same value types as the edit form. */}
      <PriceFields control={form.control as unknown as EditForm['control']} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="initialStock"
          label={COPY.initialStock}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
        />
        <Field
          control={form.control}
          name="status"
          label={COPY.status}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              options={STATUS_OPTIONS}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          loading={form.formState.isSubmitting && another}
          disabled={form.formState.isSubmitting || failure.blocked}
          onClick={() => {
            // Not a submit button: the form's submit handler would see the previous render's state.
            setAnother(true);
            void submit(true)();
          }}
        >
          {COPY.saveAndAnother}
        </Button>
        <Button
          type="submit"
          loading={form.formState.isSubmitting && !another}
          disabled={form.formState.isSubmitting || failure.blocked}
        >
          {COPY.save}
        </Button>
      </div>
    </form>
  );
}

/** SKU, price and compare-at price: the same fields on create and edit. */
function PriceFields({ control }: { readonly control: EditForm['control'] }) {
  return (
    <>
      <Field
        control={control}
        name="sku"
        label={COPY.sku}
        description={COPY.skuHelp}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={control}
          name="price"
          label={COPY.price}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        <Field
          control={control}
          name="compareAtPrice"
          label={COPY.compareAt}
          description={COPY.compareAtHelp}
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
      </div>
    </>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────────────────────────────

type EditForm = ReturnType<typeof useForm<EditVariantValues, unknown, z.output<typeof editVariantSchema>>>;

export interface EditVariantDialogProps {
  readonly product: SellerProduct;
  readonly attributes: readonly EffectiveAttribute[];
  /** The variant being edited; null closes the dialog. */
  readonly variant: SellerVariant | null;
  readonly onClose: () => void;
}

/** SE-11 edit: SKU, price, compare-at price, status; options are read-only, stock is SE-12. */
export function EditVariantDialog({ product, attributes, variant, onClose }: EditVariantDialogProps) {
  return (
    <Dialog
      open={variant !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={variant === null ? '' : COPY.editTitle(variant.sku)} className="sm:max-w-2xl">
        {variant === null ? null : (
          <EditVariantForm product={product} attributes={attributes} variant={variant} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditVariantForm({
  product,
  attributes,
  variant,
  onDone,
}: {
  readonly product: SellerProduct;
  readonly attributes: readonly EffectiveAttribute[];
  readonly variant: SellerVariant;
  readonly onDone: () => void;
}) {
  const failure = useSubmitFailure();
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);
  const refreshProduct = useRefreshProduct(product.id);
  const [confirmHide, setConfirmHide] = useState(false);
  const form: EditForm = useForm<EditVariantValues, unknown, z.output<typeof editVariantSchema>>({
    resolver: zodResolver(editVariantSchema),
    mode: 'onBlur',
    defaultValues: editVariantValues(variant),
  });
  const changed = variantHasChanges(useWatch({ control: form.control }) as EditVariantValues, variant);

  const send = async (values: z.output<typeof editVariantSchema>) => {
    failure.clear();
    const patch = variantPatch(values, variant);
    if (patch === null) return;
    try {
      await updateVariant(product.id, variant.id, patch);
      refreshProduct();
      toast({ title: COPY.saved, tone: 'success' });
      onDone();
    } catch (error) {
      if (handleNotApproved(error) || handleBlocked(error)) return;
      if (isApiError(error, 'SKU_TAKEN')) {
        form.setError('sku', { type: 'server', message: COPY.errors.SKU_TAKEN });
        return;
      }
      if (isApiError(error, 'COMPARE_AT_PRICE_INVALID')) {
        form.setError('compareAtPrice', { type: 'server', message: COPY.compareAtInvalid });
        return;
      }
      if (isApiError(error, 'VARIANT_NOT_FOUND')) {
        refreshProduct();
        toast({ title: COPY.errors.VARIANT_NOT_FOUND, tone: 'destructive' });
        onDone();
        return;
      }
      if (!applyServerErrors(error, form.setError, VARIANT_FIELD_MAP)) failure.fail(error);
    }
  };

  // The last active variant of a published product: say that the product will be hidden first (SE-11).
  const hidesProduct = (values: z.output<typeof editVariantSchema>) =>
    values.status === 'inactive' && isLastActiveVariant(product, variant);

  const onSubmit = form.handleSubmit(async (values) => {
    if (hidesProduct(values)) {
      setConfirmHide(true);
      return;
    }
    await send(values);
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <dl className="space-y-1 text-sm">
        <dt className="font-medium">{PRODUCTS_COPY.variantColumns.options}</dt>
        <dd>{variantOptionsLabel(variant, attributes)}</dd>
        <dd className="text-muted-foreground">{COPY.optionsFixed}</dd>
      </dl>
      <PriceFields control={form.control} />
      <Field
        control={form.control}
        name="status"
        label={COPY.status}
        required
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            options={STATUS_OPTIONS}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!changed || failure.blocked}>
          {COPY.save}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmHide}
        onOpenChange={setConfirmHide}
        title={COPY.editTitle(variant.sku)}
        description={COPY.lastActive}
        confirmLabel={COPY.save}
        onConfirm={() => form.handleSubmit(send)()}
      />
    </form>
  );
}

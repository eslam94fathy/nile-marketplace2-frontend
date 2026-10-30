'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  FormAlert,
  Input,
  Select,
  toast,
  type SelectOption,
} from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { useNotApprovedHandler } from '@/features/profile';
import { productKeys, updateProductImage, type ProductImage, type SellerProduct } from '../api';
import { PRODUCTS_COPY } from '../copy';
import { IMAGE_ALT_MAX, imagePatch } from '../lib/images';
import { variantShortLabel } from '../lib/variants';
import { useProductBlockedHandler } from './product-blocked';

const COPY = PRODUCTS_COPY.images;

/** The Select value for "All variants" (Radix Select refuses an empty value). */
const ALL_VARIANTS = 'all';

const imageEditSchema = z.object({
  altText: fields.nullableTrimmedString(1, IMAGE_ALT_MAX),
  variantId: z.string().transform((value) => (value === ALL_VARIANTS ? null : value)),
});
type ImageEditForm = z.input<typeof imageEditSchema>;

const FIELD_MAP = {
  altText: { field: 'altText', message: fields.FIELD_MESSAGES.tooLong(IMAGE_ALT_MAX) },
  variantId: { field: 'variantId', message: fields.FIELD_MESSAGES.required },
} as const;

const formValues = (image: ProductImage): ImageEditForm => ({
  altText: image.altText ?? '',
  variantId: image.variantId ?? ALL_VARIANTS,
});

export interface ImageEditDialogProps {
  readonly product: SellerProduct;
  /** The image being edited; null closes the dialog. */
  readonly image: ProductImage | null;
  readonly onClose: () => void;
}

/** SE-10-I "Edit": alt text and the variant the image is shown for; only changed fields are sent. */
export function ImageEditDialog({ product, image, onClose }: ImageEditDialogProps) {
  return (
    <Dialog
      open={image !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={COPY.editTitle}>
        {image === null ? null : (
          <ImageEditForm key={image.id} product={product} image={image} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImageEditForm({
  product,
  image,
  onDone,
}: {
  readonly product: SellerProduct;
  readonly image: ProductImage;
  readonly onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);
  const form = useForm<ImageEditForm, unknown, z.output<typeof imageEditSchema>>({
    resolver: zodResolver(imageEditSchema),
    mode: 'onBlur',
    defaultValues: formValues(image),
  });
  const watched = useWatch({ control: form.control }) as ImageEditForm;
  const parsed = imageEditSchema.safeParse(watched);
  // Save only with a change (an invalid value counts, so submitting shows its error).
  const changed = !parsed.success || imagePatch(parsed.data, image) !== null;

  const options: SelectOption[] = [
    { value: ALL_VARIANTS, label: COPY.allVariants },
    ...product.variants.map((variant) => ({ value: variant.id, label: variantShortLabel(variant) })),
  ];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = imagePatch(values, image);
    if (patch === null) return;
    try {
      await updateProductImage(product.id, image.id, patch);
      refresh();
      toast({ title: COPY.saved, tone: 'success' });
      onDone();
    } catch (error) {
      if (handleNotApproved(error) || handleBlocked(error)) return;
      if (isApiError(error, 'PRODUCT_IMAGE_NOT_FOUND')) {
        refresh();
        toast({ title: COPY.gone, tone: 'destructive' });
        onDone();
        return;
      }
      if (isApiError(error, 'VARIANT_NOT_FOUND')) {
        // The variant was deleted meanwhile: the product (and so the choices) is read again.
        refresh();
        form.setError('variantId', {
          type: 'server',
          message: PRODUCTS_COPY.variant.errors.VARIANT_NOT_FOUND,
        });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <Field
        control={form.control}
        name="altText"
        label={COPY.altText}
        description={COPY.altTextHint}
        render={({ field, controlProps }) => (
          <Input {...controlProps} {...field} maxLength={IMAGE_ALT_MAX} autoComplete="off" />
        )}
      />
      <Field
        control={form.control}
        name="variantId"
        label={COPY.showFor}
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            options={options}
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
    </form>
  );
}

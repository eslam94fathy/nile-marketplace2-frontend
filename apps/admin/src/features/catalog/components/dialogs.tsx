'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { Field, Input, toast } from '@nile/ui';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';
import {
  createAttribute,
  createCategory,
  createOption,
  updateAttribute,
  updateOption,
  type AttributeOption,
  type CategoryAttribute,
  type CategoryNode,
} from '../api';
import { CATALOG_COPY as COPY } from '../copy';
import { nextSortOrder } from '../lib/tree';
import {
  attributeSchema,
  categorySchema,
  labelEditSchema,
  optionSchema,
  toCreateCategoryBody,
  type AttributeValues,
  type CategoryValues,
  type LabelEditValues,
  type OptionValues,
} from '../schemas';
import { FormDialog, useCatalogRefresh } from './form-dialog';

// ── Category ──────────────────────────────────────────────────────────────────────────────────────────

export interface CreateCategoryDialogProps {
  /** null: a top-level category. */
  readonly parent: CategoryNode | null;
  /** The new category's future siblings, for the default sort order. */
  readonly siblings: readonly CategoryNode[];
  readonly onClose: () => void;
  readonly onCreated: (category: CategoryNode) => void;
}

/** AD-07 "Add top-level category" / "Add subcategory" [VERIFIED `CreateCategoryDto`]. */
export function CreateCategoryDialog({ parent, siblings, onClose, onCreated }: CreateCategoryDialogProps) {
  const refresh = useCatalogRefresh();
  const form = useForm<CategoryValues, unknown, z.output<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: { name: '', slug: '', sortOrder: String(nextSortOrder(siblings)) },
  });

  const onSubmit = async (values: z.output<typeof categorySchema>) => {
    try {
      const created = await createCategory(toCreateCategoryBody(values, parent?.id ?? null));
      await refresh();
      toast({ title: COPY.created(created.name), tone: 'success' });
      onCreated(created);
      return true;
    } catch (error) {
      if (isApiError(error, 'CATEGORY_NAME_TAKEN'))
        form.setError('name', { message: COPY.errors.CATEGORY_NAME_TAKEN });
      else if (isApiError(error, 'CATEGORY_SLUG_TAKEN'))
        form.setError('slug', { message: COPY.errors.CATEGORY_SLUG_TAKEN });
      else if (isApiError(error, 'CATEGORY_SLUG_REQUIRED'))
        form.setError('slug', { message: COPY.errors.CATEGORY_SLUG_REQUIRED });
      else if (isApiError(error, 'CATEGORY_PARENT_INACTIVE'))
        form.setError('root', { message: COPY.errors.CATEGORY_PARENT_INACTIVE });
      else if (isApiError(error, 'CATEGORY_MAX_DEPTH_EXCEEDED'))
        form.setError('root', { message: COPY.errors.CATEGORY_MAX_DEPTH_EXCEEDED });
      else if (isApiError(error, 'CATEGORY_CHILD_LIMIT_REACHED'))
        form.setError('root', { message: COPY.errors.CATEGORY_CHILD_LIMIT_REACHED });
      else throw error;
      return false;
    }
  };

  return (
    <FormDialog
      title={parent === null ? COPY.createTitle : COPY.createUnder(parent.name)}
      confirmLabel={COPY.create}
      form={form}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <RootError message={form.formState.errors.root?.message} />
      <Field
        control={form.control}
        name="name"
        label={COPY.name}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="slug"
        label={COPY.slug}
        description={COPY.slugHelp}
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="sortOrder"
        label={COPY.sortOrder}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
      />
    </FormDialog>
  );
}

/** Errors that belong to no single field (depth, child limit, inactive parent). */
export function RootError({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

// ── Attribute ─────────────────────────────────────────────────────────────────────────────────────────

export interface AddAttributeDialogProps {
  readonly category: CategoryNode;
  readonly onClose: () => void;
}

/** AD-07 "Add attribute" [VERIFIED `CreateAttributeDto`]; the code can't change later. */
export function AddAttributeDialog({ category, onClose }: AddAttributeDialogProps) {
  const refresh = useCatalogRefresh();
  const form = useForm<AttributeValues, unknown, z.output<typeof attributeSchema>>({
    resolver: zodResolver(attributeSchema),
    mode: 'onBlur',
    defaultValues: { name: '', code: '', sortOrder: String(nextSortOrder(category.attributes)) },
  });

  const onSubmit = async (values: z.output<typeof attributeSchema>) => {
    try {
      const created = await createAttribute(category.id, values);
      await refresh();
      toast({ title: COPY.attributeAdded(created.name), tone: 'success' });
      return true;
    } catch (error) {
      if (isApiError(error, 'ATTRIBUTE_CODE_CONFLICT'))
        form.setError('code', { message: COPY.errors.ATTRIBUTE_CODE_CONFLICT });
      else if (isApiError(error, 'CATEGORY_HAS_PRODUCTS'))
        form.setError('root', { message: COPY.errors.CATEGORY_HAS_PRODUCTS });
      else if (isApiError(error, 'ATTRIBUTE_LIMIT_REACHED'))
        form.setError('root', { message: COPY.errors.ATTRIBUTE_LIMIT_REACHED });
      else throw error;
      return false;
    }
  };

  return (
    <FormDialog
      title={COPY.addAttribute}
      confirmLabel={COPY.addAttribute}
      form={form}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <RootError message={form.formState.errors.root?.message} />
      <Field
        control={form.control}
        name="name"
        label={COPY.attributeName}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="code"
        label={COPY.code}
        description={COPY.attributeCodeHelp}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="sortOrder"
        label={COPY.sortOrder}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
      />
    </FormDialog>
  );
}

// ── Option ────────────────────────────────────────────────────────────────────────────────────────────

export interface AddOptionDialogProps {
  readonly attribute: CategoryAttribute;
  readonly onClose: () => void;
}

/** AD-07 options: add [VERIFIED `CreateOptionDto`]; the code can't change later. */
export function AddOptionDialog({ attribute, onClose }: AddOptionDialogProps) {
  const refresh = useCatalogRefresh();
  const form = useForm<OptionValues, unknown, z.output<typeof optionSchema>>({
    resolver: zodResolver(optionSchema),
    mode: 'onBlur',
    defaultValues: { value: '', code: '', sortOrder: String(nextSortOrder(attribute.options)) },
  });

  const onSubmit = async (values: z.output<typeof optionSchema>) => {
    try {
      const created = await createOption(attribute.id, values);
      await refresh();
      toast({ title: COPY.optionAdded(created.value), tone: 'success' });
      return true;
    } catch (error) {
      if (isApiError(error, 'OPTION_CODE_TAKEN'))
        form.setError('code', { message: COPY.errors.OPTION_CODE_TAKEN });
      else if (isApiError(error, 'OPTION_LIMIT_REACHED'))
        form.setError('root', { message: COPY.errors.OPTION_LIMIT_REACHED });
      else throw error;
      return false;
    }
  };

  return (
    <FormDialog
      title={COPY.addOptionTitle}
      description={COPY.optionsOf(attribute.name)}
      confirmLabel={COPY.addOptionTitle}
      form={form}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <RootError message={form.formState.errors.root?.message} />
      <Field
        control={form.control}
        name="value"
        label={COPY.value}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="code"
        label={COPY.code}
        description={COPY.optionCodeHelp}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="sortOrder"
        label={COPY.sortOrder}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
      />
    </FormDialog>
  );
}

// ── Edit label and order (attribute or option) ───────────────────────────────────────────────────────

export type LabelEditTarget =
  | { readonly kind: 'attribute'; readonly item: CategoryAttribute }
  | { readonly kind: 'option'; readonly item: AttributeOption };

/** Edit an attribute's name or an option's value, and its sort order; the code is shown, not editable. */
export function EditLabelDialog({
  target,
  onClose,
}: {
  readonly target: LabelEditTarget;
  readonly onClose: () => void;
}) {
  const refresh = useCatalogRefresh();
  const label = target.kind === 'attribute' ? target.item.name : target.item.value;
  const form = useForm<LabelEditValues, unknown, z.output<typeof labelEditSchema>>({
    resolver: zodResolver(labelEditSchema),
    mode: 'onBlur',
    defaultValues: { label, sortOrder: String(target.item.sortOrder) },
  });

  const onSubmit = async (values: z.output<typeof labelEditSchema>) => {
    const sortOrder = values.sortOrder === target.item.sortOrder ? {} : { sortOrder: values.sortOrder };
    if (target.kind === 'attribute') {
      const body = { ...(values.label === target.item.name ? {} : { name: values.label }), ...sortOrder };
      if (Object.keys(body).length > 0) await updateAttribute(target.item.id, body);
      toast({ title: COPY.attributeSaved });
    } else {
      const body = { ...(values.label === target.item.value ? {} : { value: values.label }), ...sortOrder };
      if (Object.keys(body).length > 0) await updateOption(target.item.id, body);
      toast({ title: COPY.optionSaved });
    }
    await refresh();
    return true;
  };

  return (
    <FormDialog
      title={target.kind === 'attribute' ? COPY.editAttribute(label) : COPY.editOption(label)}
      description={COPY.codeFixed(target.item.code)}
      confirmLabel={COPY.save}
      form={form}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <Field
        control={form.control}
        name="label"
        label={target.kind === 'attribute' ? COPY.attributeName : COPY.value}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="sortOrder"
        label={COPY.sortOrder}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
      />
    </FormDialog>
  );
}

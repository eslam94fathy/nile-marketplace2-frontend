'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which checkout pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Checkbox, Field, FormAlert, Input, PhoneInput, Select } from '@nile/ui';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { createAddress, updateAddress, type Address, type Governorate } from '../api';
import { ADDRESS_COPY } from '../copy';
import { isDeliverable } from '../lib/address-text';
import {
  addressSchema,
  addressValues,
  EMPTY_ADDRESS,
  hasAddressChanges,
  toCreateAddressBody,
  toUpdateAddressBody,
  type AddressValues,
} from '../schemas';

const FIELD_MAP = {
  label: { field: 'label', message: fields.FIELD_MESSAGES.tooLong(50) },
  recipientName: { field: 'recipientName', message: fields.FIELD_MESSAGES.tooLong(100) },
  recipientPhone: { field: 'recipientPhone', message: fields.FIELD_MESSAGES.egPhone },
  governorateId: { field: 'governorateId', message: fields.FIELD_MESSAGES.required },
  city: { field: 'city', message: fields.FIELD_MESSAGES.tooLong(100) },
  area: { field: 'area', message: fields.FIELD_MESSAGES.tooLong(100) },
  street: { field: 'street', message: fields.FIELD_MESSAGES.tooLong(200) },
  building: { field: 'building', message: fields.FIELD_MESSAGES.tooLong(50) },
  floor: { field: 'floor', message: fields.FIELD_MESSAGES.tooLong(10) },
  apartment: { field: 'apartment', message: fields.FIELD_MESSAGES.tooLong(10) },
  landmark: { field: 'landmark', message: fields.FIELD_MESSAGES.tooLong(200) },
} as const;

type TextField =
  'label' | 'recipientName' | 'city' | 'area' | 'street' | 'building' | 'floor' | 'apartment' | 'landmark';

const TEXT_FIELDS: readonly { name: TextField; autoComplete: string; required: boolean }[] = [
  { name: 'city', autoComplete: 'address-level2', required: true },
  { name: 'area', autoComplete: 'address-level3', required: true },
  { name: 'street', autoComplete: 'address-line1', required: true },
  { name: 'building', autoComplete: 'address-line2', required: true },
  { name: 'floor', autoComplete: 'off', required: false },
  { name: 'apartment', autoComplete: 'off', required: false },
  { name: 'landmark', autoComplete: 'off', required: false },
];

/** Creating: `hasDefault` says whether the customer already has a default (spec 04 C-3). */
interface CreateMode {
  readonly mode: 'create';
  readonly hasDefault: boolean;
}

/** Editing a saved address; `onGone` when it no longer exists (`ADDRESS_NOT_FOUND`). */
interface EditMode {
  readonly mode: 'edit';
  readonly address: Address;
  readonly onGone: () => void;
}

export type AddressFormProps = (CreateMode | EditMode) & {
  readonly governorates: readonly Governorate[];
  readonly onSaved: (address: Address) => void;
  /** The list of governorates changed under the form (`GOVERNORATE_NOT_FOUND`): reload it. */
  readonly onGovernoratesStale: () => void;
};

/** Address form (spec 01 SF-16), create and edit; used in checkout (SF-07 §1) and the address book. */
export function AddressForm(props: AddressFormProps) {
  const { governorates, onSaved, onGovernoratesStale } = props;
  const editing = props.mode === 'edit' ? props.address : null;
  const failure = useSubmitFailure({
    ADDRESS_LIMIT_REACHED: ADDRESS_COPY.errors.ADDRESS_LIMIT_REACHED,
    ADDRESS_NOT_FOUND: ADDRESS_COPY.errors.ADDRESS_NOT_FOUND,
    DEFAULT_ADDRESS_UNSET_NOT_ALLOWED: ADDRESS_COPY.errors.DEFAULT_ADDRESS_UNSET_NOT_ALLOWED,
  });
  const hydrated = useHydrated();
  const form = useForm<AddressValues, unknown, z.output<typeof addressSchema>>({
    resolver: zodResolver(addressSchema),
    mode: 'onBlur',
    defaultValues: editing === null ? EMPTY_ADDRESS : addressValues(editing),
  });
  const current = useWatch({ control: form.control }) as AddressValues;
  /** Editing: Save waits for a change (PATCH never sends an empty body). */
  const unchanged = editing !== null && !hasAddressChanges(current, editing);
  /** Whether the "Make this my default address" box is offered. */
  const offerDefault = props.mode === 'create' ? props.hasDefault : !props.address.isDefault;
  const options = governorates.map((governorate) => ({
    value: governorate.id,
    // Not deliverable yet, but still a valid address to save [SPEC 04].
    label: isDeliverable(governorate) ? governorate.name : ADDRESS_COPY.noDeliveryYet(governorate.name),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      if (props.mode === 'create') {
        onSaved(await createAddress(toCreateAddressBody(values, !props.hasDefault || values.isDefault)));
        return;
      }
      const body = toUpdateAddressBody(values, props.address);
      if (body === null) return;
      onSaved(await updateAddress(props.address.id, body));
    } catch (error) {
      if (props.mode === 'edit' && isApiError(error, 'ADDRESS_NOT_FOUND')) props.onGone();
      if (isApiError(error, 'GOVERNORATE_NOT_FOUND')) {
        onGovernoratesStale();
        form.setError('governorateId', {
          type: 'server',
          message: ADDRESS_COPY.errors.GOVERNORATE_NOT_FOUND,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="label"
          label={ADDRESS_COPY.fields.label}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} />}
        />
        <Field
          control={form.control}
          name="recipientName"
          label={ADDRESS_COPY.fields.recipientName}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="name" />}
        />
      </div>
      <Field
        control={form.control}
        name="recipientPhone"
        label={ADDRESS_COPY.fields.recipientPhone}
        required
        render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
      />
      <Field
        control={form.control}
        name="governorateId"
        label={ADDRESS_COPY.fields.governorate}
        required
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            options={options}
            placeholder={ADDRESS_COPY.fields.governoratePlaceholder}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((item) => (
          <Field
            key={item.name}
            control={form.control}
            name={item.name}
            label={ADDRESS_COPY.fields[item.name]}
            required={item.required}
            render={({ field, controlProps }) => (
              <Input {...field} {...controlProps} autoComplete={item.autoComplete} />
            )}
          />
        ))}
      </div>
      {offerDefault ? (
        <Field
          control={form.control}
          name="isDefault"
          label={ADDRESS_COPY.fields.isDefault}
          layout="inline"
          render={({ field, controlProps }) => (
            <Checkbox
              {...controlProps}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked === true);
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {editing === null ? ADDRESS_COPY.willBeDefault : ADDRESS_COPY.isTheDefault}
        </p>
      )}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        disabled={!hydrated || failure.blocked || unchanged}
      >
        {ADDRESS_COPY.save}
      </Button>
    </form>
  );
}

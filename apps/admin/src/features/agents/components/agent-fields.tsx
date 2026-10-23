'use client';

import type { Schema } from '@nile/api';
import { Button, Field, FormAlert, Input, PhoneInput, Select, UI_COPY } from '@nile/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Control, FieldValues } from 'react-hook-form';
import { AGENTS_COPY as COPY } from '../copy';
import type { AgentFormValues } from '../schemas';

export interface AgentProfileFieldsProps<Output extends FieldValues> {
  readonly control: Control<AgentFormValues, unknown, Output>;
  readonly governorates: UseQueryResult<Schema<'GovernorateDto'>[]>;
}

/** Full name, mobile and home governorate: shared by AD-10 and AD-11's edit form. */
export function AgentProfileFields<Output extends FieldValues>({
  control,
  governorates,
}: AgentProfileFieldsProps<Output>) {
  const options = (governorates.data ?? []).map((governorate) => ({
    value: governorate.id,
    label: governorate.name,
  }));
  return (
    <>
      <Field
        control={control}
        name="fullName"
        label={COPY.fullName}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={control}
        name="phone"
        label={COPY.phone}
        required
        render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
      />
      {governorates.isError ? (
        <FormAlert>
          {COPY.governoratesFailed}{' '}
          <Button variant="link" className="h-auto px-0" onClick={() => void governorates.refetch()}>
            {UI_COPY.tryAgain}
          </Button>
        </FormAlert>
      ) : null}
      <Field
        control={control}
        name="homeGovernorateId"
        label={COPY.homeGovernorate}
        description={COPY.homeGovernorateHelp}
        required
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            options={options}
            placeholder={COPY.governoratePlaceholder}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            disabled={governorates.isPending}
          />
        )}
      />
    </>
  );
}

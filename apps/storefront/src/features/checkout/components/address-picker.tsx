'use client';

import { Badge, Button, Dialog, DialogContent } from '@nile/ui';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import {
  ADDRESS_COPY,
  AddressForm,
  addressLines,
  governorateById,
  isDeliverable,
  MAX_ADDRESSES,
  type Address,
  type Governorate,
} from '@/features/addresses';
import { CHECKOUT_COPY } from '../copy';

export interface AddressPickerProps {
  readonly addresses: readonly Address[];
  readonly governorates: readonly Governorate[];
  readonly selectedId: string | null;
  readonly onSelect: (addressId: string) => void;
  /** A new address was saved: refresh the list (and select it when deliverable). */
  readonly onCreated: (address: Address) => void;
  readonly onGovernoratesStale: () => void;
}

/**
 * SF-07 §1 Delivery address: the customer's addresses (default first, as returned [SPEC 04]); addresses in a
 * governorate without delivery are shown but can't be chosen. "Add a new address" opens the form in a dialog;
 * without any address the form is inline.
 */
export function AddressPicker({
  addresses,
  governorates,
  selectedId,
  onSelect,
  onCreated,
  onGovernoratesStale,
}: AddressPickerProps) {
  const [adding, setAdding] = useState(false);
  const name = useId();
  const hasDefault = addresses.some((address) => address.isDefault);
  const form = (
    <AddressForm
      governorates={governorates}
      hasDefault={hasDefault}
      onGovernoratesStale={onGovernoratesStale}
      onCreated={(address) => {
        setAdding(false);
        onCreated(address);
      }}
    />
  );

  if (addresses.length === 0) return form;

  return (
    <div className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="sr-only">{CHECKOUT_COPY.addressLegend}</legend>
        {addresses.map((address) => {
          const governorate = governorateById(governorates, address.governorateId);
          const deliverable = isDeliverable(governorate);
          const lines = addressLines(address, governorate?.name ?? null);
          const id = `${name}-${address.id}`;
          return (
            <div key={address.id}>
              <input
                id={id}
                type="radio"
                name={name}
                className="peer sr-only"
                checked={selectedId === address.id}
                disabled={!deliverable}
                onChange={() => {
                  onSelect(address.id);
                }}
              />
              <label
                htmlFor={id}
                className="block cursor-pointer rounded-lg border border-border p-4 peer-checked:border-2 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:bg-muted"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {address.label}
                  {address.isDefault ? <Badge tone="info">{CHECKOUT_COPY.default}</Badge> : null}
                </span>
                <span className="block text-sm">
                  {address.recipientName} · {address.recipientPhone}
                </span>
                <span className="block text-sm text-muted-foreground">{lines.main}</span>
                {lines.extra === null ? null : (
                  <span className="block text-sm text-muted-foreground">{lines.extra}</span>
                )}
                {deliverable ? null : (
                  <span className="mt-1 block text-sm text-destructive">
                    {CHECKOUT_COPY.notDeliverable(governorate?.name ?? CHECKOUT_COPY.thisArea)}
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </fieldset>
      {addresses.length >= MAX_ADDRESSES ? (
        <p className="text-sm text-muted-foreground">{ADDRESS_COPY.errors.ADDRESS_LIMIT_REACHED}</p>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setAdding(true);
          }}
        >
          <Plus aria-hidden="true" />
          {CHECKOUT_COPY.addAddress}
        </Button>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={CHECKOUT_COPY.addAddress} placement="end" className="overflow-y-auto">
          {form}
        </DialogContent>
      </Dialog>
    </div>
  );
}

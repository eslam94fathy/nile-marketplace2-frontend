'use client';

import { isApiError } from '@nile/api';
import { errorMessage, governoratesQuery } from '@nile/query';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Skeleton,
  toast,
} from '@nile/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { browserApi } from '@/lib/browser-api';
import {
  addressesQuery,
  addressKeys,
  deleteAddress,
  MAX_ADDRESSES,
  updateAddress,
  type Address,
  type Governorate,
} from '../api';
import { ADDRESS_COPY } from '../copy';
import { addressLines, governorateById, isDeliverable } from '../lib/address-text';
import { AddressForm } from './address-form';

const COPY = ADDRESS_COPY.book;

/** What the dialog is doing: adding, or editing one address. */
type Editing = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly address: Address } | null;

/** The address was deleted elsewhere (`ADDRESS_NOT_FOUND`): say so and show the list as it is now. */
function addressGone(refetch: () => void) {
  refetch();
  toast({ title: ADDRESS_COPY.errors.ADDRESS_NOT_FOUND, tone: 'destructive' });
}

/** A failed card action: its message by code (conventions §4). */
function reportActionFailure(error: unknown, refetch: () => void) {
  if (isApiError(error, 'ADDRESS_NOT_FOUND')) {
    addressGone(refetch);
    return;
  }
  toast({ title: errorMessage(error), tone: 'destructive' });
}

/** SF-16 Addresses: the customer's address book (≤ 20, default first, as returned [SPEC 04]). */
export function AddressBook() {
  const queryClient = useQueryClient();
  const addresses = useQuery(addressesQuery());
  const governorates = useQuery(governoratesQuery(browserApi));
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const refetch = () => void queryClient.invalidateQueries({ queryKey: addressKeys.list() });

  const makeDefault = useMutation({
    mutationFn: (address: Address) => updateAddress(address.id, { isDefault: true }),
    onSettled: refetch,
    onError: (error) => {
      reportActionFailure(error, refetch);
    },
  });

  const failed = [addresses, governorates].find((query) => query.isError);
  if (failed !== undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => {
            void addresses.refetch();
            void governorates.refetch();
          }}
          correlationId={isApiError(failed.error) ? (failed.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (addresses.data === undefined || governorates.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={COPY.title} />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const list = addresses.data;
  const zones = governorates.data;
  const atLimit = list.length >= MAX_ADDRESSES;
  const hasDefault = list.some((address) => address.isDefault);
  const addButton = atLimit ? null : (
    <Button
      onClick={() => {
        setEditing({ mode: 'create' });
      }}
    >
      <Plus aria-hidden="true" />
      {COPY.add}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} actions={list.length === 0 ? undefined : addButton} />
      {list.length === 0 ? (
        <EmptyState title={COPY.empty} action={addButton} />
      ) : (
        <>
          {/* Deleting the default leaves none: nothing is promoted automatically [SPEC 04]. */}
          {hasDefault ? null : <Notice>{COPY.chooseDefault}</Notice>}
          {atLimit ? <p className="text-sm text-muted-foreground">{COPY.limit}</p> : null}
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                governorate={governorateById(zones, address.governorateId)}
                makingDefault={makeDefault.isPending && makeDefault.variables.id === address.id}
                onEdit={() => {
                  setEditing({ mode: 'edit', address });
                }}
                onDelete={() => {
                  setDeleting(address);
                }}
                onMakeDefault={() => {
                  makeDefault.mutate(address);
                }}
              />
            ))}
          </ul>
        </>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing?.mode === 'edit' ? COPY.editTitle : COPY.addTitle}
          placement="end"
          className="overflow-y-auto"
        >
          {editing === null ? null : (
            <AddressForm
              {...(editing.mode === 'edit'
                ? {
                    mode: 'edit' as const,
                    address: editing.address,
                    onGone: () => {
                      setEditing(null);
                      addressGone(refetch);
                    },
                  }
                : { mode: 'create' as const, hasDefault })}
              governorates={zones}
              onGovernoratesStale={() => void governorates.refetch()}
              onSaved={() => {
                setEditing(null);
                refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={COPY.deleteTitle}
        description={COPY.deleteConfirm}
        confirmLabel={COPY.deleteAction}
        destructive
        onConfirm={async () => {
          if (deleting === null) return;
          try {
            await deleteAddress(deleting.id);
          } catch (error) {
            reportActionFailure(error, refetch);
          } finally {
            refetch();
          }
        }}
      />
    </div>
  );
}

interface AddressCardProps {
  readonly address: Address;
  readonly governorate: Governorate | null;
  readonly makingDefault: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onMakeDefault: () => void;
}

function AddressCard({
  address,
  governorate,
  makingDefault,
  onEdit,
  onDelete,
  onMakeDefault,
}: AddressCardProps) {
  const lines = addressLines(address, governorate?.name ?? null);
  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {address.label}
          {address.isDefault ? <Badge tone="info">{COPY.defaultBadge}</Badge> : null}
        </p>
        <p className="text-sm">
          {address.recipientName} · {address.recipientPhone}
        </p>
        <p className="text-sm text-muted-foreground">{lines.main}</p>
        {lines.extra === null ? null : <p className="text-sm text-muted-foreground">{lines.extra}</p>}
        {isDeliverable(governorate) ? null : (
          <p className="text-sm text-destructive">{COPY.notDeliverable}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" aria-label={COPY.edit(address.label)} onClick={onEdit}>
          {COPY.editLabel}
        </Button>
        <Button variant="outline" size="sm" aria-label={COPY.remove(address.label)} onClick={onDelete}>
          {COPY.removeLabel}
        </Button>
        {address.isDefault ? null : (
          <Button
            variant="outline"
            size="sm"
            aria-label={COPY.makeDefault(address.label)}
            loading={makingDefault}
            onClick={onMakeDefault}
          >
            {COPY.makeDefaultLabel}
          </Button>
        )}
      </div>
    </li>
  );
}

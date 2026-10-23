'use client';

import { isApiError } from '@nile/api';
import { toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import { FormDialog as SharedFormDialog, type FormDialogProps } from '@/components/form-dialog';
import { catalogKeys } from '../api';
import { CATALOG_COPY as COPY } from '../copy';

/** Every catalog write is followed by a fresh tree (spec 03 AD-07). */
export function useCatalogRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogKeys.tree() });
}

const GONE_CODES = ['CATEGORY_NOT_FOUND', 'ATTRIBUTE_NOT_FOUND', 'OPTION_NOT_FOUND'] as const;

/** Something was removed or changed elsewhere: reload the tree and say so. True when handled. */
export function useGoneHandler() {
  const refresh = useCatalogRefresh();
  return (error: unknown): boolean => {
    if (!GONE_CODES.some((code) => isApiError(error, code))) return false;
    void refresh();
    toast({ title: COPY.errors.gone, tone: 'destructive' });
    return true;
  };
}

/** The shared form dialog with the catalog's "no longer exists" handling. */
export function FormDialog<Values extends FieldValues, Output>(
  props: Omit<FormDialogProps<Values, Output>, 'handleError'>,
) {
  return <SharedFormDialog {...props} handleError={useGoneHandler()} />;
}

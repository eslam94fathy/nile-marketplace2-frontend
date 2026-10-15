'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { Button, ConfirmDialog, FormAlert, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { profileKeys, reapply } from '../api';
import { PROFILE_COPY } from '../copy';

const COPY = PROFILE_COPY.reapply;

/**
 * SE-07-A2 Re-apply, shown only to rejected sellers (the caller checks). The answer replaces the profile, so
 * the badge and banner switch to "waiting for approval". `SELLER_INVALID_STATUS_TRANSITION` means the status
 * already changed: the profile is refetched and the banner explains the new one.
 */
export function ReapplyButton() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const failure = useSubmitFailure();

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) failure.clear();
  };

  const confirm = async () => {
    failure.clear();
    try {
      const profile = await reapply();
      queryClient.setQueryData(profileKeys.profile(), profile);
      toast({ title: COPY.done, tone: 'success' });
    } catch (error) {
      if (isApiError(error, 'SELLER_INVALID_STATUS_TRANSITION')) {
        void queryClient.invalidateQueries({ queryKey: profileKeys.profile() });
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {COPY.label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={COPY.title}
        description={COPY.confirm}
        confirmLabel={COPY.confirmAction}
        onConfirm={confirm}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
      </ConfirmDialog>
    </>
  );
}

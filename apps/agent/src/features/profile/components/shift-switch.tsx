'use client';

import { errorMessage } from '@nile/query';
import { ConfirmDialog, Label, Switch, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { profileKeys, profileQuery, setOnShift } from '../api';
import { PROFILE_COPY as COPY } from '../copy';
import { useInactiveHandler } from '../hooks';

/**
 * AG-03 in the top bar: shows only what the API last returned. Going on shift needs no confirmation; going
 * off shift says that current shipments still need finishing [SPEC 11 UC-DE-2].
 */
export function ShiftSwitch() {
  const id = useId();
  const queryClient = useQueryClient();
  const profile = useQuery(profileQuery());
  const handleInactive = useInactiveHandler();
  const [confirmOff, setConfirmOff] = useState(false);
  const [pending, setPending] = useState(false);
  const onShift = profile.data?.onShift ?? false;

  const send = async (next: boolean) => {
    setPending(true);
    try {
      const updated = await setOnShift(next);
      queryClient.setQueryData(profileKeys.profile(), updated);
      toast({ title: updated.onShift ? COPY.nowOn : COPY.nowOff });
    } catch (error) {
      if (!handleInactive(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-sm">
        {onShift ? COPY.onShift : COPY.offShift}
      </Label>
      <Switch
        id={id}
        checked={onShift}
        disabled={profile.data === undefined || profile.data.status === 'inactive' || pending}
        onCheckedChange={(next) => {
          if (next) void send(true);
          else setConfirmOff(true);
        }}
      />
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={COPY.goOffTitle}
        description={COPY.goOffConfirm(profile.data?.activeShipmentCount ?? 0)}
        confirmLabel={COPY.goOff}
        onConfirm={() => send(false)}
      />
    </div>
  );
}

'use client';

import { isApiError } from '@nile/api';
import { AGENT_STATUS_LABELS } from '@nile/domain';
import { governoratesQuery } from '@nile/query';
import { AGENT_STATUS_TONES, ErrorState, PageHeader, Skeleton, StatusBadge } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/session/sign-out-button';
import { browserApi } from '@/lib/browser-api';
import { ROUTES } from '@/lib/routes';
import { profileQuery } from '../api';
import { PROFILE_COPY as COPY } from '../copy';

/** AG-02 Me: the agent's details (read-only), Security and Sign out. Shown even while inactive. */
export function MeView() {
  const profile = useQuery(profileQuery());
  const governorates = useQuery(governoratesQuery(browserApi));
  const governorateName = (id: string) => governorates.data?.find((item) => item.id === id)?.name ?? '—';

  let body: ReactNode;
  if (profile.isError) {
    body = (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void profile.refetch()}
        correlationId={isApiError(profile.error) ? (profile.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (profile.data === undefined) {
    body = <Skeleton className="h-48" />;
  } else {
    const data = profile.data;
    body = (
      <>
        <dl className="space-y-3 text-base">
          <Row label={COPY.fullName}>{data.fullName}</Row>
          <Row label={COPY.email}>{data.email}</Row>
          <Row label={COPY.phone}>{data.phone}</Row>
          <Row label={COPY.homeGovernorate}>{governorateName(data.homeGovernorateId)}</Row>
          <Row label={COPY.status}>
            <StatusBadge value={data.status} labels={AGENT_STATUS_LABELS} tones={AGENT_STATUS_TONES} />
          </Row>
          <Row label={COPY.shift}>{data.onShift ? COPY.onShift : COPY.offShift}</Row>
          <Row label={COPY.activeShipments}>{data.activeShipmentCount}</Row>
        </dl>
        <p className="text-sm text-muted-foreground">{COPY.contactAdmin}</p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.meTitle} />
      {body}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={ROUTES.security}
          className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.security}
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

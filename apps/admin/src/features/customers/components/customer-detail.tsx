'use client';

import { isApiError } from '@nile/api';
import { formatDate, USER_STATUS_LABELS } from '@nile/domain';
import {
  Button,
  buttonVariants,
  ErrorState,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  StatusBadge,
  USER_STATUS_TONES,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ACCOUNT_COPY, SuspendUserDialog, useReactivate } from '@/features/users';
import { customerOrdersPath, customerReturnsPath, customerReviewsPath, ROUTES } from '@/lib/routes';
import { customerQuery, isCustomerMissing, type AdminCustomerDetail } from '../api';
import { CUSTOMERS_COPY as COPY, fullName } from '../copy';

const LINK_CLASS = 'font-medium text-primary underline-offset-4 hover:underline';

/** AD-26 Customer: details, Suspend / Reactivate (AD-24), and their orders, returns and reviews. */
export function CustomerDetail({ customerId }: { readonly customerId: string }) {
  const customer = useQuery(customerQuery(customerId));
  if (customer.isError) {
    if (isCustomerMissing(customer.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.customers} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToCustomers}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.detailTitle} />
        <ErrorState
          message={COPY.detailFailed}
          onRetry={() => void customer.refetch()}
          correlationId={isApiError(customer.error) ? (customer.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (customer.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <CustomerContent customer={customer.data} />;
}

function CustomerContent({ customer }: { readonly customer: AdminCustomerDetail }) {
  const [suspending, setSuspending] = useState(false);
  const { pendingId, reactivate } = useReactivate();
  return (
    <div className="space-y-8">
      <PageHeader
        title={fullName(customer)}
        description={
          <StatusBadge value={customer.userStatus} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />
        }
        actions={
          customer.userStatus === 'active' ? (
            <Button
              variant="outline"
              onClick={() => {
                setSuspending(true);
              }}
            >
              {ACCOUNT_COPY.suspend}
            </Button>
          ) : customer.userStatus === 'suspended' ? (
            <Button
              variant="outline"
              loading={pendingId === customer.userId}
              onClick={() => void reactivate(customer.userId, customer.email)}
            >
              {ACCOUNT_COPY.reactivate}
            </Button>
          ) : null
        }
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="customer-details-heading" className="space-y-3">
          <h2 id="customer-details-heading" className="text-lg font-semibold">
            {COPY.detailsHeading}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.email} value={customer.email} />
            <Row label={COPY.phone} value={customer.phone} />
            <Row label={COPY.addresses} value={String(customer.addressCount)} />
            <Row label={COPY.created} value={formatDate(customer.createdAt)} />
          </dl>
        </section>
        <section aria-labelledby="customer-activity-heading" className="space-y-2 text-sm">
          <h2 id="customer-activity-heading" className="text-lg font-semibold">
            {COPY.activityHeading}
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href={customerOrdersPath(customer.id)} className={LINK_CLASS}>
                {COPY.orders}
              </Link>
            </li>
            <li>
              <Link href={customerReturnsPath(customer.id)} className={LINK_CLASS}>
                {COPY.returns}
              </Link>
            </li>
            <li>
              <Link href={customerReviewsPath(customer.id)} className={LINK_CLASS}>
                {COPY.reviews}
              </Link>
            </li>
          </ul>
        </section>
      </div>
      {suspending ? (
        <SuspendUserDialog
          userId={customer.userId}
          email={customer.email}
          title={ACCOUNT_COPY.suspendCustomerTitle}
          description={ACCOUNT_COPY.suspendCustomerConfirm}
          onClose={() => {
            setSuspending(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

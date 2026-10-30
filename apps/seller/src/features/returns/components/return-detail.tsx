'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney, RETURN_REASON_LABELS, RETURN_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  ErrorState,
  Money,
  NileImage,
  NotFoundScreen,
  PageHeader,
  PrivateImage,
  RETURN_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { orderPath, ROUTES } from '@/lib/routes';
import { isReturnMissing, returnQuery, type SellerReturn } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { ReturnActions } from './return-actions';

/** SE-19 Return: `GET /seller/returns/{id}`, live on `return.updated`. No customer contact data [SPEC 18 S-11]. */
export function ReturnDetail({ returnId }: { readonly returnId: string }) {
  const query = useQuery(returnQuery(returnId));

  if (query.isError) {
    if (isReturnMissing(query.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.returns} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToReturns}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void query.refetch()}
          correlationId={isApiError(query.error) ? (query.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  return <ReturnContent item={query.data} onChanged={() => void query.refetch()} />;
}

function ReturnContent({ item, onChanged }: { readonly item: SellerReturn; readonly onChanged: () => void }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.returnNumber(item.returnNumber)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={item.status}
              labels={RETURN_STATUS_LABELS.seller}
              tones={RETURN_STATUS_TONES}
            />
            <Link
              href={orderPath(item.sellerOrderId)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {COPY.orderNumber(item.orderNumber)}
            </Link>
          </span>
        }
      />
      <ReturnActions item={item} />

      <Section id="reason" title={COPY.reasonHeading}>
        <p className="text-sm">{RETURN_REASON_LABELS.staff[item.reason]}</p>
        {item.returnFeePayer === 'seller' ? (
          <p className="text-sm">{COPY.sellerFault(formatMoney(item.returnFee))}</p>
        ) : null}
        {item.rejectionReason === null ? null : (
          <p className="text-sm">
            <span className="font-medium">{COPY.yourReason}:</span> {item.rejectionReason}
          </p>
        )}
      </Section>

      {item.description === null ? null : (
        <Section id="description" title={COPY.descriptionHeading}>
          {/* Customer text, rendered as text (CLAUDE.md §7). */}
          <p className="text-sm whitespace-pre-line">{item.description}</p>
        </Section>
      )}

      {item.photos.length === 0 ? null : (
        <Section id="photos" title={COPY.photosHeading}>
          <ul className="flex flex-wrap gap-3">
            {item.photos.map((photo, index) => (
              <li key={photo.id}>
                {/* Private, expiring URLs (conventions §12.1): a failed load reads the return again once. */}
                <PrivateImage
                  image={photo}
                  alt={COPY.photoAlt(index + 1, item.photos.length)}
                  sizes="128px"
                  onExpired={onChanged}
                  className="size-32 rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="items" title={COPY.itemsHeading}>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {item.items.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-4 p-3 text-sm">
              <NileImage
                image={line.image}
                alt=""
                sizes="56px"
                placeholder="product"
                className="size-14 rounded-md bg-muted object-cover"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{line.productName}</p>
                {line.attributes.length === 0 ? null : (
                  <p className="text-muted-foreground">
                    {line.attributes.map((option) => `${option.attribute}: ${option.value}`).join(' · ')}
                  </p>
                )}
                <p className="text-muted-foreground">{COPY.quantity(line.quantity)}</p>
                {line.restock === null ? null : (
                  <p className="text-muted-foreground">{line.restock ? COPY.restocked : COPY.notRestocked}</p>
                )}
              </div>
              <p>
                <span className="sr-only">{COPY.paid}: </span>
                <Money value={line.paidAmount} />
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="refund" title={COPY.refundHeading}>
        <p className="text-sm">
          <span className="font-medium">{COPY.refundAmount}:</span> <Money value={item.refundAmount} />
        </p>
      </Section>

      <Deadlines item={item} />

      {item.timeline.length === 0 ? null : (
        <Section id="timeline" title={COPY.timelineHeading}>
          <ol className="space-y-1 text-sm">
            {[...item.timeline]
              .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
              .map((entry) => (
                <li key={`${entry.status}-${entry.at}`}>
                  <span className="font-medium">{RETURN_STATUS_LABELS.seller[entry.status]}</span> ·{' '}
                  {formatDateTime(entry.at)}
                </li>
              ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

/** The deadline that matters for the current status. */
function Deadlines({ item }: { readonly item: SellerReturn }) {
  const rows: { label: string; at: string }[] = [];
  if (item.status === 'requested' && item.sellerDecisionDeadlineAt !== null) {
    rows.push({ label: COPY.deadlines.decision, at: item.sellerDecisionDeadlineAt });
  }
  if (item.status === 'received' && item.inspectionDeadlineAt !== null) {
    rows.push({ label: COPY.deadlines.inspection, at: item.inspectionDeadlineAt });
  }
  if (item.status === 'rejected' && item.escalationDeadlineAt !== null) {
    rows.push({ label: COPY.deadlines.escalation, at: item.escalationDeadlineAt });
  }
  if (rows.length === 0) return null;
  return (
    <Section id="deadlines" title={COPY.deadlinesHeading}>
      <dl className="space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2">
            <dt className="font-medium">{row.label}</dt>
            <dd>{formatDateTime(row.at)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const headingId = `return-${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

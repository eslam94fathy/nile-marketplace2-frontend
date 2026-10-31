import type { AuditTargetType } from '@nile/domain';
import { buttonVariants } from '@nile/ui';
import Link from 'next/link';
import { targetHistoryPath } from '@/lib/routes';
import { AUDIT_COPY as COPY } from '../copy';

/** "History" on the screen of an audited thing: AD-38 filtered to it (spec 03 AD-38 deep links). */
export function HistoryLink({
  targetType,
  targetId,
}: {
  readonly targetType: AuditTargetType;
  readonly targetId: string;
}) {
  return (
    <Link href={targetHistoryPath(targetType, targetId)} className={buttonVariants({ variant: 'outline' })}>
      {COPY.history}
    </Link>
  );
}

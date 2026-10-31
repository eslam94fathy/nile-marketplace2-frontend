import { AUDIT_ACTOR_TYPE_LABELS, AUDIT_TARGET_TYPE_LABELS, type AuditTargetType } from '@nile/domain';
import Link from 'next/link';
import type { AuditEntry } from '../api';
import { AUDIT_COPY as COPY } from '../copy';
import { auditTargetHref } from '../lib/targets';

const LINK = 'text-primary underline-offset-4 hover:underline';

/**
 * Who made the change (spec 03 AD-38): "You", the admin's email, "System (command line)" for `cli`; an admin the
 * backend can no longer name keeps a neutral label (the email is `null` then).
 */
export function actorText(entry: AuditEntry, currentUserId: string): string {
  if (entry.actorType === 'cli' || entry.actor === null) return AUDIT_ACTOR_TYPE_LABELS.cli;
  if (entry.actor.userId === currentUserId) return COPY.you;
  return entry.actor.email ?? COPY.unknownAdmin;
}

/** Target type and id (short in lists), linked to the target's screen when the console has one. */
export function TargetText({
  targetType,
  targetId,
  short = false,
}: {
  readonly targetType: AuditTargetType;
  readonly targetId: string | null;
  readonly short?: boolean;
}) {
  const type = AUDIT_TARGET_TYPE_LABELS[targetType];
  if (targetId === null) return <>{type}</>;
  const text = `${type} ${short ? COPY.shortId(targetId) : targetId}`;
  const href = auditTargetHref(targetType, targetId);
  return href === null ? (
    <span className="break-all">{text}</span>
  ) : (
    <Link href={href} className={`break-all ${LINK}`}>
      {text}
    </Link>
  );
}

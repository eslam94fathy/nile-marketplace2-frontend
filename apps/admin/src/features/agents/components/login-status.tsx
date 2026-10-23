import { USER_STATUS_LABELS, USER_STATUSES, type UserStatus } from '@nile/domain';
import { Badge, StatusBadge, USER_STATUS_TONES } from '@nile/ui';

const isUserStatus = (value: string): value is UserStatus =>
  (USER_STATUSES as readonly string[]).includes(value);

/** The agent's sign-in (`userStatus` is a plain string in the API): known values get their label and tone. */
export function LoginStatus({ value }: { readonly value: string }) {
  return isUserStatus(value) ? (
    <StatusBadge value={value} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />
  ) : (
    <Badge tone="neutral">{value}</Badge>
  );
}

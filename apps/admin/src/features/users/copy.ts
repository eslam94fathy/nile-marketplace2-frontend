// AD-24 Users copy (spec 03 §7.3, TM2-COPY) and the account actions shared with AD-03 and AD-26. Role and status
// labels: @nile/domain USER_ROLE_LABELS, USER_STATUS_LABELS.

export const ACCOUNT_COPY = {
  reason: 'Reason',
  statusChanged: 'This account changed meanwhile. Here is its current state.',
  cannotSuspendSelf: "You can't suspend your own account.",

  resend: 'Resend invite',
  resendAction: (email: string) => `Resend invite to ${email}`,
  resendTitle: 'Resend invite',
  resendConfirm: (email: string) => `Send a new invitation to ${email}? The previous link stops working.`,
  resent: (email: string) => `A new invitation was sent to ${email}.`,
  notInvited: 'This account has already accepted its invitation.',

  suspend: 'Suspend',
  suspendAction: (email: string) => `Suspend ${email}`,
  suspended: (email: string) => `${email} was suspended.`,
  suspendCustomerTitle: 'Suspend customer',
  suspendCustomerConfirm: "They are signed out everywhere and can't sign in.",

  reactivate: 'Reactivate',
  reactivateAction: (email: string) => `Reactivate ${email}`,
  reactivated: (email: string) => `${email} can sign in again.`,
} as const;

export const USERS_COPY = {
  title: 'Users',
  description: 'Every account on Nile. Admins are managed on Admins, agents on Agents.',
  caption: 'User accounts',
  roleFilter: 'Role',
  allRoles: 'All roles',
  statusFilter: 'Status',
  allStatuses: 'All statuses',
  emailFilter: 'Email starts with',
  from: 'Created from',
  to: 'Created to',
  columns: {
    email: 'Email',
    role: 'Role',
    status: 'Status',
    verified: 'Email verified',
    lastLogin: 'Last sign-in',
    created: 'Created',
    actions: 'Actions',
  },
  never: '—',
  you: '(you)',
  empty: 'No users yet.',
  emptyFiltered: 'No users match these filters.',
  clearFilters: 'Clear filters',
  loadFailed: "The users couldn't be loaded.",
} as const;

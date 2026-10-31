// AD-03 Admins copy (spec 03). Status labels: @nile/domain USER_STATUS_LABELS (CLAUDE.md §14.1c). The account
// actions' copy is shared: features/users ACCOUNT_COPY.

export const ADMINS_COPY = {
  title: 'Admins',
  scopeNote: "Customer accounts and delivery agents can't be suspended here.",
  tabsLabel: 'Admin status',
  tabs: { all: 'All', invited: 'Invited', active: 'Active', suspended: 'Suspended' },
  caption: 'Admin accounts',
  columns: {
    email: 'Email',
    status: 'Status',
    verified: 'Email verified',
    lastLogin: 'Last sign-in',
    created: 'Created',
    actions: 'Actions',
  },
  you: '(you)',
  never: '—',
  empty: 'No admins here.',
  loadFailed: "The admin accounts couldn't be loaded.",

  invite: 'Invite admin',
  inviteTitle: 'Invite admin',
  inviteHelp: 'They get an email with a link to set their password.',
  email: 'Email',
  sendInvite: 'Send invitation',
  invited: (email: string) => `Invitation sent to ${email}. It's valid for 72 hours.`,
  emailTaken: 'This email already has an account.',

  suspendTitle: 'Suspend admin',
  suspendConfirm: (email: string) => `${email} will be signed out everywhere and can't sign in.`,
} as const;

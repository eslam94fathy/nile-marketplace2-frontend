// Header account area (spec 01 §2.2).
export const ACCOUNT_COPY = {
  navLabel: 'Account',
  signIn: 'Sign in',
  createAccount: 'Create account',
  cart: 'Cart',
  menu: 'Account',
  greeting: (firstName: string) => `Hi, ${firstName}`,
  orders: 'Orders',
  /** SF-Q-13 account navigation labels (spec 01 §10.2). */
  profile: 'Profile',
  returns: 'Returns',
  reviews: 'Reviews',
  addresses: 'Addresses',
  support: 'Help & support',
  security: 'Security',
} as const;

// SF-Q-13 account navigation (T-K6b). Entries marked TK6B-COPY approved 2026-10-30 (CLAUDE.md §14.1be).
export const ACCOUNT_NAV_COPY = {
  /** TK6B-COPY: the side navigation's landmark name (the header's is "Account"). */
  navLabel: 'Your account',
  /** TK6B-COPY: the phone menu page's title and the link back to it above every account page. */
  menuTitle: 'Account',
} as const;

// SF-15 Profile.
export const PROFILE_COPY = {
  title: 'Your account',
  email: 'Email',
  emailFixed: "Email can't be changed.",
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Mobile phone',
  memberSince: (date: string) => `Member since ${date}`,
  save: 'Save',
  saved: 'Profile saved.',
  loadFailed: "Your profile couldn't be loaded.",
} as const;

// Header account area (spec 01 §2.2).
export const ACCOUNT_COPY = {
  navLabel: 'Account',
  signIn: 'Sign in',
  createAccount: 'Create account',
  cart: 'Cart',
  menu: 'Account',
  greeting: (firstName: string) => `Hi, ${firstName}`,
  orders: 'Orders',
  addresses: 'Addresses',
  account: 'Account',
  security: 'Security',
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

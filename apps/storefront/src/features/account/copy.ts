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

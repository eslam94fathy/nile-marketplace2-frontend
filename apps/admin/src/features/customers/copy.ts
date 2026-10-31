// AD-25 Customers and AD-26 Customer copy (spec 03 §7.3, TM2-COPY). Status labels: @nile/domain
// USER_STATUS_LABELS; account actions: features/users ACCOUNT_COPY.

export const CUSTOMERS_COPY = {
  title: 'Customers',
  caption: 'Customers',
  nameFilter: 'Name',
  phoneFilter: 'Phone',
  phoneHint: 'Type the whole number.',
  columns: {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    status: 'Status',
    created: 'Created',
  },
  empty: 'No customers yet.',
  emptyFiltered: 'No customers match these filters.',
  clearFilters: 'Clear filters',
  loadFailed: "The customers couldn't be loaded.",

  // AD-26
  detailTitle: 'Customer',
  detailsHeading: 'Details',
  email: 'Email',
  phone: 'Phone',
  addresses: 'Saved addresses',
  created: 'Created',
  activityHeading: 'Activity',
  orders: 'Orders',
  returns: 'Returns',
  reviews: 'Reviews',
  notFound: "This customer doesn't exist.",
  backToCustomers: 'Back to customers',
  detailFailed: "This customer couldn't be loaded.",
} as const;

export const fullName = (customer: { readonly firstName: string; readonly lastName: string }): string =>
  `${customer.firstName} ${customer.lastName}`;

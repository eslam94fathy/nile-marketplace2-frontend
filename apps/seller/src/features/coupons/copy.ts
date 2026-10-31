// Seller coupons copy (spec 02 §8.3 SE-21 … SE-23). Labels: @nile/domain COUPON_DISPLAY_STATUS_LABELS,
// DISCOUNT_TYPE_LABELS, COUPON_SCOPE_LABELS.seller. The rest approved as TL5-COPY (CLAUDE.md §14.1bl).

export const COUPONS_COPY = {
  // SE-21
  title: 'Coupons',
  newCoupon: 'New coupon',
  tabsLabel: 'Coupon status',
  /** the `status[eq]` filter: the coupon's own switch, not the display status */
  tabs: { all: 'All', active: 'Active', inactive: 'Inactive' },
  caption: 'Your coupons',
  columns: {
    code: 'Code',
    discount: 'Discount',
    scope: 'Applies to',
    dates: 'Valid',
    uses: 'Uses',
    status: 'Status',
  },
  percentDiscount: (percent: string, max: string | null) =>
    max === null ? `${percent} %` : `${percent} %, up to ${max}`,
  fixedDiscount: (amount: string) => `${amount} off`,
  validRange: (from: string, to: string) => `${from} – ${to}`,
  uses: (count: number, limit: number | null) =>
    limit === null ? `${String(count)} of unlimited` : `${String(count)} of ${String(limit)}`,
  blockedBadge: 'Blocked by Nile',
  unavailableCategory: 'Unavailable category',
  empty: "You haven't created any coupons yet.",
  emptyFiltered: 'No coupons with this status.',
  listFailed: "Your coupons couldn't be loaded.",

  // SE-22 / SE-23
  help: "Customers enter the code at checkout. The discount applies to your products only and is paid by you; Nile's commission is calculated after the discount.",
  loadFailed: "This coupon couldn't be loaded.",
  notFound: "This coupon doesn't exist.",
  backToCoupons: 'Back to coupons',
  profileFailed: "Your account status couldn't be loaded.",
  blocked: (reason: string) => `Nile blocked this coupon: ${reason}`,
  locked: 'Locked after the first use.',
  /** SE-23 summary */
  usedTimes: (count: number) => (count === 1 ? 'Used once' : `Used ${String(count)} times`),
  fields: {
    code: 'Code',
    codeHint: 'Letters, digits and hyphens, 4 to 32. Saved in capitals.',
    discountType: 'Discount type',
    percent: 'Discount (%)',
    fixed: 'Discount (EGP)',
    maxDiscount: 'Maximum discount (EGP, optional)',
    minItemsSubtotal: 'Minimum order (eligible items)',
    minItemsHint: 'In EGP. 0 for no minimum.',
    appliesTo: 'Applies to',
    category: 'Category',
    categoryPlaceholder: 'Choose a category',
    starts: 'Starts',
    ends: 'Ends',
    timesHint: 'Cairo time.',
    globalLimit: 'Total uses (optional)',
    globalLimitHint: 'Leave empty for unlimited.',
    perCustomerLimit: 'Uses per customer',
    active: 'Active',
    blockedActive: "Nile blocked this coupon, so it can't be turned on.",
  },
  /** validation */
  invalid: {
    code: 'Use 4 to 32 letters, digits or hyphens.',
    percent: 'Enter a percentage from 1 to 90 with up to 2 decimals.',
    category: 'Choose a category.',
    dateTime: 'Enter a date and time.',
    endsAfterStart: 'The end must be after the start.',
    globalLimit: 'Enter a whole number from 1 to 1000000.',
    globalLimitBelowUses: (count: number) => `Total uses can't be below the ${String(count)} uses so far.`,
    perCustomerLimit: 'Enter a whole number from 1 to 100.',
    /** COUPON_INVALID on a field without its own sentence */
    field: 'Check this value.',
  },
  create: 'Create coupon',
  created: 'Coupon created.',
  save: 'Save',
  saved: 'Coupon saved.',
  errors: {
    COUPON_CODE_TAKEN: 'This code is already used. Choose another.',
    COUPON_LOCKED: 'This coupon has been used, so only the end date, total uses and status can change.',
    /** toast with the banner after COUPON_BLOCKED */
    COUPON_BLOCKED: "Nile blocked this coupon, so it can't be turned on.",
    CATEGORY_NOT_FOUND: 'This category is no longer available.',
  },
} as const;

import type { Schema } from '@nile/api';

type BannerStatus = Exclude<Schema<'SellerProfileDto'>['status'], 'approved'>;

// Seller status banner (spec 02 §2.2). The same sentence explains every control the status disables.
const BANNERS = {
  pending_approval: "Your account is waiting for approval. You can add products once you're approved.",
  rejected: (reason: string | null) =>
    reason === null
      ? 'Your application was rejected. Update your profile and re-apply.'
      : `Your application was rejected: ${reason}. Update your profile and re-apply.`,
  suspended:
    'Your account is suspended. Your products are hidden from the store. Please finish your open orders.',
} as const;

/** The banner sentence for a status that limits the seller. */
export function bannerText(status: BannerStatus, rejectionReason: string | null): string {
  return status === 'rejected' ? BANNERS.rejected(rejectionReason) : BANNERS[status];
}

export const PROFILE_COPY = {
  updateProfile: 'Update your profile',
  /** `SELLER_NOT_APPROVED` while the refetched profile still says approved (status changed twice). */
  notApprovedFallback: "Your account can't make this change right now.",
  reapply: {
    label: 'Re-apply',
    title: 'Re-apply',
    confirm: 'Send your application for review again? Make sure your details are up to date.',
    confirmAction: 'Send for review',
    done: 'Your application was sent for review.',
  },
} as const;

// SE-07 Profile and status.
export const PROFILE_PAGE_COPY = {
  title: 'Profile',
  loadFailed: "Your profile couldn't be loaded.",
  statusHeading: 'Status',
  approvedOn: (date: string) => `Approved on ${date}`,
  rejectionReason: 'Reason',
  commission: (percent: string) => `Nile's commission: ${percent}`,
  commissionNote: 'Commission is charged on item prices only, not on the delivery fee.',
  detailsHeading: 'Business details',
  email: 'Email',
  emailFixed: "Email can't be changed.",
  businessName: 'Business name',
  contactPhone: 'Contact phone',
  pickupAddress: 'Pickup address',
  pickupHelp: 'Delivery agents collect your parcels from this address.',
  governorate: 'Governorate',
  governoratePlaceholder: 'Choose a governorate',
  governoratesFailed: "Governorates couldn't be loaded.",
  city: 'City',
  area: 'Area',
  street: 'Street',
  building: 'Building',
  landmark: 'Landmark (optional)',
  newOrdersOnly: 'Changes apply to new orders only.',
  save: 'Save',
  saved: 'Profile saved.',
  errors: {
    BUSINESS_NAME_TAKEN: 'This business name is already taken.',
    GOVERNORATE_NOT_FOUND: 'This governorate is no longer available. Please choose again.',
  },
} as const;

// SE-06 Overview (T-H1 part: status checklist and shortcuts; orders T-H4, balance T-H5).
export const OVERVIEW_COPY = {
  title: 'Overview',
  checklistLabel: 'Application progress',
  emailVerified: 'Email verified',
  waitingForReview: 'Waiting for admin review',
  shortcutsHeading: 'Shortcuts',
  addProduct: 'Add product',
  orders: 'Orders',
  products: 'Products',
} as const;

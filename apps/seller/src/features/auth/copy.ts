// Seller registration copy (spec 02 SE-02). Shared sign-in copy: @nile/auth-screens AUTH_COPY.
export const REGISTER_COPY = {
  title: 'Become a seller',
  submit: 'Create seller account',
  haveAccount: 'Already selling on Nile?',
  signIn: 'Sign in',
  forgotPassword: 'Forgot password?',
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
  /** Shown on the verify screen after registering (spec 02 SE-02). */
  reviewNote: 'After verifying your email, our team will review your application.',
  errors: {
    BUSINESS_NAME_TAKEN: 'This business name is already taken.',
    /** The list changed meanwhile; it is reloaded (spec 02 SE-02). [PROPOSED wording] */
    GOVERNORATE_NOT_FOUND: 'This governorate is no longer available. Please choose again.',
  },
} as const;

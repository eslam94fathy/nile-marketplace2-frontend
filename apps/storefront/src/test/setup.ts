import '@nile/test-utils/jsdom-setup';

// Public settings for component tests: modules read them at import (src/lib/env/public.ts). The app origin
// matches jsdom's default location, so same-origin requests and the BFF base agree.
export const TEST_APP_ORIGIN = 'http://localhost:3000';

Object.assign(process.env, {
  NEXT_PUBLIC_APP_NAME: 'storefront',
  NEXT_PUBLIC_STOREFRONT_URL: TEST_APP_ORIGIN,
  NEXT_PUBLIC_SELLER_URL: 'http://seller.test',
  NEXT_PUBLIC_ADMIN_URL: 'http://admin.test',
  NEXT_PUBLIC_AGENT_URL: 'http://agent.test',
  NEXT_PUBLIC_REFRESH_SKEW_SECONDS: '60',
  NEXT_PUBLIC_REALTIME_URL: 'http://realtime.test',
  NEXT_PUBLIC_MEDIA_PUBLIC_ORIGIN: 'http://media.test',
  NEXT_PUBLIC_MEDIA_PRIVATE_ORIGIN: 'http://storage.test',
  NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN: 'http://storage.test',
  NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES: '15',
});

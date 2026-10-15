import { createKashierSession } from './api';
import { goToKashier } from './redirect';

/**
 * After a card checkout (spec 01 SF-07-A1 step 3): go to `checkoutUrl`, or, when checkout returned none
 * (session creation failed after the order was saved [SPEC 09 SD-5]), open a session first. False when the
 * shopper can't be sent to Kashier now (no session, or a URL that isn't `https:`); never throws.
 */
export async function leaveForKashier(orderId: string, checkoutUrl: string | null): Promise<boolean> {
  try {
    const url = checkoutUrl ?? (await createKashierSession(orderId)).checkoutUrl;
    return goToKashier(orderId, url);
  } catch {
    return false;
  }
}

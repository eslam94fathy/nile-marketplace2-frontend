import type { RealtimeMessageData } from '@nile/api';
import { reviewKeys } from './api';

/** The link of a `review_received` notification [SPEC 13 NO-32]. */
export const REVIEW_RECEIVED_LINK = '/seller/reviews';

/**
 * A new review arrives as `notification.created` with the reviews link (design 02 §5.2): the review lists are
 * stale. The notifications feature owns the message; the app's keeper adds these keys to its handler.
 */
export function reviewKeysForNotification(payload: RealtimeMessageData['notification.created']) {
  return payload.link === REVIEW_RECEIVED_LINK ? [reviewKeys.lists()] : [];
}

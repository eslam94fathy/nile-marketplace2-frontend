import type { ReviewStatus } from '../enums';
import type { Labels } from './types';

/** Author view: spec 01 §10.6. Admin view: spec 03 §7.6. */
export const REVIEW_STATUS_LABELS = {
  author: { published: 'Published', hidden: 'Hidden by Nile' },
  admin: { published: 'Published', hidden: 'Hidden' },
} as const satisfies Readonly<Record<'author' | 'admin', Labels<ReviewStatus>>>;

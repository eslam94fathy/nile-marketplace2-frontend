import { defineFactory, fixtureId } from '../factory';

/** `SellerReviewDto` (ids from 19000): a 4-star review without photos or reply that the seller can answer. */
export const sellerReviewFactory = defineFactory<'SellerReviewDto'>((sequence) => {
  const productId = fixtureId(19500 + sequence);
  return {
    id: fixtureId(19000 + sequence),
    productId,
    product: { id: productId, name: `Reviewed product ${String(sequence)}` },
    canReply: true,
    rating: 4,
    title: 'Good shirt',
    body: 'Soft fabric.',
    images: [],
    reviewer: { displayName: 'Mona A.' },
    variantOptions: [{ attribute: 'Size', value: 'M' }],
    reply: null,
    createdAt: '2026-10-25T10:00:00.000Z',
    editedAt: null,
  };
});

/** `AdminReviewDto` (ids from 25000): a published 2-star review with no photos and no reply. */
export const adminReviewFactory = defineFactory<'AdminReviewDto'>((sequence) => ({
  id: fixtureId(25000 + sequence),
  productId: fixtureId(25300 + sequence),
  rating: 2,
  title: 'Faded after one wash',
  body: 'The colour ran.',
  images: [],
  reviewer: { displayName: 'Omar K.' },
  variantOptions: [{ attribute: 'Size', value: 'L' }],
  status: 'published',
  customerId: fixtureId(25600 + sequence),
  sellerId: fixtureId(25900 + sequence),
  orderItemId: fixtureId(26200 + sequence),
  hiddenReason: null,
  hiddenAt: null,
  reply: null,
  createdAt: '2026-10-26T09:00:00.000Z',
  editedAt: null,
}));

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

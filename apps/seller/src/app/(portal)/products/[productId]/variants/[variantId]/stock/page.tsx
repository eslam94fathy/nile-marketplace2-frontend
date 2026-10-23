import type { Metadata } from 'next';
import { VariantStockHistory } from '@/features/products';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Stock history' };

/** SE-13 Stock history: readable in any seller status [SPEC 06 UC-CA-3]. */
export default async function StockHistoryPage({
  params,
}: PageProps<'/products/[productId]/variants/[variantId]/stock'>) {
  await requireSession();
  const { productId, variantId } = await params;
  return <VariantStockHistory productId={productId} variantId={variantId} />;
}

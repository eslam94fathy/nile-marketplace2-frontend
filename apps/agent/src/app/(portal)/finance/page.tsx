import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Finance' };

export default function FinancePage() {
  return <PlaceholderScreen title="Finance" task="T-H12" />;
}

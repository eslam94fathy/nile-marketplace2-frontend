import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Overview' };

export default function OverviewPage() {
  return <PlaceholderScreen title="Overview" task="T-H1" />;
}

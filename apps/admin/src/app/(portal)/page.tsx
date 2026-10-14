import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <PlaceholderScreen title="Dashboard" task="T-H6" />;
}

import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return <PlaceholderScreen title="Profile" task="T-H1" />;
}

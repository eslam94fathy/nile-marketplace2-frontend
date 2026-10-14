import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Me' };

export default function MePage() {
  return <PlaceholderScreen title="Me" task="T-H12" />;
}

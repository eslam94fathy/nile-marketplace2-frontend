import type { Metadata } from 'next';
import { TokenSheet } from '@nile/ui';

// T-C1 token page: not linked, not indexed. To be removed or gated before release (CLAUDE.md §14.3 TC-1).
export const metadata: Metadata = {
  title: 'Design tokens',
  robots: { index: false, follow: false },
};

export default function DesignTokensPage() {
  return (
    <main>
      <TokenSheet />
    </main>
  );
}

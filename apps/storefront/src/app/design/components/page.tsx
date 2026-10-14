import type { Metadata } from 'next';
import { ComponentGallery } from '@nile/ui';

// T-C2 component gallery: not linked, not indexed. Removed or gated with the token page before release (TC-1).
export const metadata: Metadata = {
  title: 'Components',
  robots: { index: false, follow: false },
};

export default function ComponentsPage() {
  return (
    <main>
      <ComponentGallery />
    </main>
  );
}

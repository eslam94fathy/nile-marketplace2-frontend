import type { ReactNode } from 'react';
import { StorefrontAuthScreens } from '@/features/auth';

// Sign-in screens share the storefront shell (root layout); this layout only gives them the app's settings.
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return <StorefrontAuthScreens>{children}</StorefrontAuthScreens>;
}

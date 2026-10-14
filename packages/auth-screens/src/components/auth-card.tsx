import type { ReactNode } from 'react';

/** Layout of the sign-in screens: one narrow column with the page title (spec 01 §5). */
export function AuthCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

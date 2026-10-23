'use client';

import { ErrorState, UI_COPY } from '@nile/ui';

// Route error boundary (Next.js 16: `retry` re-fetches and re-renders the segment). Server errors carry a
// `digest` only (no details reach the browser); it is shown as the reference to match the server logs.
export default function RouteError({
  error,
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="sr-only">{UI_COPY.errorTitle}</h1>
      <ErrorState onRetry={retry} correlationId={error.digest} />
    </div>
  );
}

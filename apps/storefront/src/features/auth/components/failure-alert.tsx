'use client';

import { isApiError } from '@nile/api';
import { wrongAppRole } from '@nile/auth/client';
import { FormAlert } from '@nile/ui';
import { publicEnv } from '@/lib/env/public';
import { AUTH_COPY } from '../copy';
import type { SubmitFailure } from '../lib/submit-failure';

/** Other roles' sites, for the wrong-app message (spec 01 SF-10, links from config). */
const OTHER_SITES: Readonly<Record<string, { name: string; url: string }>> = {
  seller: { name: 'seller', url: publicEnv.NEXT_PUBLIC_SELLER_URL },
  admin: { name: 'admin', url: publicEnv.NEXT_PUBLIC_ADMIN_URL },
  delivery_agent: { name: 'delivery', url: publicEnv.NEXT_PUBLIC_AGENT_URL },
};

/** The form-level alert of a failed submit; `WRONG_APP` points to the account's own site. */
export function FailureAlert({ failure }: { readonly failure: SubmitFailure }) {
  if (isApiError(failure.error, 'WRONG_APP')) {
    const role = wrongAppRole(failure.error);
    const site = role !== null && Object.hasOwn(OTHER_SITES, role) ? OTHER_SITES[role] : undefined;
    if (site !== undefined) {
      return (
        <FormAlert>
          <p>{AUTH_COPY.wrongApp.message(site.name)}</p>
          <a href={site.url} className="font-medium underline underline-offset-4">
            {AUTH_COPY.wrongApp.link(site.name)}
          </a>
        </FormAlert>
      );
    }
  }
  if (failure.message === null) return null;
  return <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>;
}

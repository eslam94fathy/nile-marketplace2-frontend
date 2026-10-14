'use client';

import { isApiError } from '@nile/api';
import { wrongAppRole } from '@nile/auth/client';
import { FormAlert } from '@nile/ui';
import { useAuthScreens, type UserRole } from '../config';
import { AUTH_COPY } from '../copy';
import type { SubmitFailure } from '../submit-failure';

/** The form-level alert of a failed submit; `WRONG_APP` points to the account's own site. */
export function FailureAlert({ failure }: { readonly failure: SubmitFailure }) {
  const { otherSites } = useAuthScreens();
  if (isApiError(failure.error, 'WRONG_APP')) {
    const role = wrongAppRole(failure.error);
    const site = role !== null && Object.hasOwn(otherSites, role) ? otherSites[role as UserRole] : undefined;
    if (site !== undefined) {
      return (
        <FormAlert>
          <p>{AUTH_COPY.wrongApp.message(site.account, site.site)}</p>
          <a href={site.url} className="font-medium underline underline-offset-4">
            {AUTH_COPY.wrongApp.link(site.site)}
          </a>
        </FormAlert>
      );
    }
  }
  if (failure.message === null) return null;
  return <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>;
}

// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { BusinessIdentity } from './business-identity';
import { StatusBanner } from './status-banner';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const server = setupMswServer();

const profile = (overrides: Partial<Schema<'SellerProfileDto'>> = {}) =>
  sellerProfileFactory({ businessName: 'Nile Crafts', ...overrides });

const REJECTED = profile({ status: 'rejected', rejectionReason: 'Missing pickup details' });

function serve(data: Schema<'SellerProfileDto'>) {
  server.use(mockApi('get', '/seller/profile', ({ reply }) => reply.ok(data), { base: BFF_BASE }));
}

const renderShellParts = () =>
  renderWithProviders(
    <>
      <BusinessIdentity />
      <StatusBanner />
      <Toaster />
    </>,
  );

describe('seller status (spec 02 §2.1, §2.2)', () => {
  it('pending approval: business name, badge and the waiting banner (where a new seller lands)', async () => {
    serve(profile());
    renderShellParts();
    expect(await screen.findByText('Nile Crafts')).toBeDefined();
    expect(screen.getByText('Waiting for approval')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(
      "Your account is waiting for approval. You can add products once you're approved.",
    );
  });

  it('rejected: the reason, Re-apply and a link to update the profile', async () => {
    serve(REJECTED);
    renderShellParts();
    expect(
      await screen.findByText(/rejected: Missing pickup details\. Update your profile and re-apply\./),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Re-apply' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Update your profile' }).getAttribute('href')).toBe('/profile');
  });

  it('rejected, on the profile page: no link to the page itself', async () => {
    pathname.current = '/profile';
    serve(REJECTED);
    renderShellParts();
    expect(await screen.findByRole('button', { name: 'Re-apply' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Update your profile' })).toBeNull();
    pathname.current = '/';
  });

  it('suspended: products hidden, open orders continue', async () => {
    serve(profile({ status: 'suspended' }));
    renderShellParts();
    expect(await screen.findByText(/Your account is suspended\./)).toBeDefined();
    expect(screen.getByText('Suspended')).toBeDefined();
  });

  it('approved: badge only, no banner', async () => {
    serve(profile({ status: 'approved', approvedAt: '2026-10-14T09:00:00.000Z' }));
    renderShellParts();
    expect(await screen.findByText('Approved')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('profile unavailable: no banner and no identity, the page still renders', async () => {
    server.use(
      mockApi('get', '/seller/profile', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    const view = renderWithProviders(
      <>
        <BusinessIdentity />
        <StatusBanner />
      </>,
    );
    // While loading, the header shows a skeleton; after the failure nothing is rendered at all.
    expect(view.container.childElementCount).toBe(1);
    await vi.waitFor(() => {
      expect(view.container.childElementCount).toBe(0);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('re-apply (spec 02 SE-07-A2)', () => {
  it('asks first; the answer switches the badge and banner to "waiting for approval"', async () => {
    serve(REJECTED);
    let calls = 0;
    server.use(
      mockApi(
        'post',
        '/seller/profile/reapply',
        ({ reply }) => {
          calls += 1;
          return reply.ok({ ...REJECTED, status: 'pending_approval' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderShellParts();
    await view.user.click(await screen.findByRole('button', { name: 'Re-apply' }));
    const dialog = screen.getByRole('dialog', { name: 'Re-apply' });
    expect(
      within(dialog).getByText(
        'Send your application for review again? Make sure your details are up to date.',
      ),
    ).toBeDefined();
    expect(calls).toBe(0);
    await view.user.click(within(dialog).getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByText('Your application was sent for review.')).toBeDefined();
    expect(calls).toBe(1);
    expect(screen.queryByRole('dialog', { name: 'Re-apply' })).toBeNull();
    expect(screen.getByText('Waiting for approval')).toBeDefined();
    expect(screen.getAllByRole('status')[0]?.textContent).toContain('Your account is waiting for approval.');
  });

  it('cancel sends nothing', async () => {
    serve(REJECTED);
    let calls = 0;
    server.use(
      mockApi(
        'post',
        '/seller/profile/reapply',
        ({ reply }) => {
          calls += 1;
          return reply.ok(REJECTED);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderShellParts();
    await view.user.click(await screen.findByRole('button', { name: 'Re-apply' }));
    await view.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toBe(0);
  });

  it('SELLER_INVALID_STATUS_TRANSITION: closes and refetches; the banner shows the new status', async () => {
    serve(REJECTED);
    server.use(
      mockApi(
        'post',
        '/seller/profile/reapply',
        ({ reply }) => {
          // An admin approved meanwhile: the next profile read says so.
          serve(profile({ status: 'approved', approvedAt: '2026-10-15T09:00:00.000Z' }));
          return reply.error(409, 'SELLER_INVALID_STATUS_TRANSITION');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderShellParts();
    await view.user.click(await screen.findByRole('button', { name: 'Re-apply' }));
    await view.user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByText('Approved')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Re-apply' })).toBeNull();
  });

  it('other failures keep the dialog open with the message', async () => {
    serve(REJECTED);
    server.use(
      mockApi('post', '/seller/profile/reapply', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    const view = renderShellParts();
    await view.user.click(await screen.findByRole('button', { name: 'Re-apply' }));
    await view.user.click(screen.getByRole('button', { name: 'Send for review' }));
    const dialog = screen.getByRole('dialog', { name: 'Re-apply' });
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    expect(screen.getByText('Rejected')).toBeDefined();
  });
});

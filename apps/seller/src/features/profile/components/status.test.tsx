// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { BusinessIdentity } from './business-identity';
import { StatusBanner } from './status-banner';

const server = setupMswServer();

function profile(overrides: Partial<Schema<'SellerProfileDto'>> = {}): Schema<'SellerProfileDto'> {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    email: 'shop@example.test',
    businessName: 'Nile Crafts',
    contactPhone: '+201112345678',
    pickupAddress: {
      governorateId: '01900000-0000-7000-8000-000000000002',
      city: 'Cairo',
      area: 'Zamalek',
      street: '26th of July St',
      building: '12',
      landmark: null,
    },
    status: 'pending_approval',
    rejectionReason: null,
    commissionRate: '0.1000',
    approvedAt: null,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
    ...overrides,
  };
}

function serve(data: Schema<'SellerProfileDto'>) {
  server.use(mockApi('get', '/seller/profile', ({ reply }) => reply.ok(data), { base: BFF_BASE }));
}

const renderShellParts = () =>
  renderWithProviders(
    <>
      <BusinessIdentity />
      <StatusBanner />
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

  it('rejected: the reason and a link to update the profile', async () => {
    serve(profile({ status: 'rejected', rejectionReason: 'Missing pickup details' }));
    renderShellParts();
    expect(
      await screen.findByText(/rejected: Missing pickup details\. Update your profile and re-apply\./),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Update your profile' }).getAttribute('href')).toBe('/profile');
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
    const view = renderShellParts();
    // While loading, the header shows a skeleton; after the failure nothing is rendered at all.
    expect(view.container.childElementCount).toBe(1);
    await vi.waitFor(() => {
      expect(view.container.childElementCount).toBe(0);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// @vitest-environment jsdom
import { ApiError } from '@nile/api';
import { mockApi, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Button, Toaster } from '@nile/ui';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { sellerAccess, useNotApprovedHandler } from './access';
import { StatusBanner } from './components/status-banner';

vi.mock('next/navigation', () => ({ usePathname: () => '/products' }));

const server = setupMswServer();

describe('sellerAccess (spec 02 §2.2)', () => {
  it('approved: catalog and orders, no reason', () => {
    expect(sellerAccess({ status: 'approved', rejectionReason: null })).toEqual({
      catalog: true,
      orders: true,
      reason: null,
    });
  });

  it('pending approval: nothing yet, with the banner sentence', () => {
    expect(sellerAccess({ status: 'pending_approval', rejectionReason: null })).toEqual({
      catalog: false,
      orders: false,
      reason: "Your account is waiting for approval. You can add products once you're approved.",
    });
  });

  it('rejected: nothing, with the reason in the sentence', () => {
    expect(sellerAccess({ status: 'rejected', rejectionReason: 'Blurry documents' })).toEqual({
      catalog: false,
      orders: false,
      reason: 'Your application was rejected: Blurry documents. Update your profile and re-apply.',
    });
  });

  it('suspended: open orders continue, the catalog is closed', () => {
    expect(sellerAccess({ status: 'suspended', rejectionReason: null })).toMatchObject({
      catalog: false,
      orders: true,
    });
  });
});

/** Stands in for any catalog write of later tasks: the API refuses it with `SELLER_NOT_APPROVED`. */
function FakeWrite({ error }: { readonly error: unknown }) {
  const handle = useNotApprovedHandler();
  const [result, setResult] = useState('');
  return (
    <>
      <Button
        onClick={() => {
          setResult(handle(error) ? 'handled' : 'left to the caller');
        }}
      >
        Publish
      </Button>
      <output>{result}</output>
    </>
  );
}

const notApproved = new ApiError(403, 'SELLER_NOT_APPROVED', 'mocked');

describe('SELLER_NOT_APPROVED from a write (spec 02 §2.2)', () => {
  it('refetches the profile: the banner appears and its sentence is toasted', async () => {
    // The page was loaded while approved; an admin suspended the seller since.
    let profileCalls = 0;
    server.use(
      mockApi(
        'get',
        '/seller/profile',
        ({ reply }) => {
          profileCalls += 1;
          return reply.ok(sellerProfileFactory({ status: profileCalls === 1 ? 'approved' : 'suspended' }));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(
      <>
        <StatusBanner />
        <FakeWrite error={notApproved} />
        <Toaster />
      </>,
    );
    await vi.waitFor(() => {
      expect(profileCalls).toBe(1);
    });
    expect(screen.queryByText(/Your account is suspended\./)).toBeNull();
    await view.user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByText('handled')).toBeDefined();
    // Once in the banner, once in the toast.
    await vi.waitFor(() => {
      expect(screen.getAllByText(/Your account is suspended\./)).toHaveLength(2);
    });
    expect(profileCalls).toBe(2);
  });

  it('other errors are left to the caller', async () => {
    const view = renderWithProviders(<FakeWrite error={new ApiError(404, 'PRODUCT_NOT_FOUND', 'mocked')} />);
    await view.user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByText('left to the caller')).toBeDefined();
  });
});

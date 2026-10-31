// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { adminCustomerDetailFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CustomerDetail } from './customer-detail';
import { CustomersList } from './customers-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Detail = Schema<'AdminCustomerDetailDto'>;

const MONA = adminCustomerDetailFactory({ firstName: 'Mona', lastName: 'Ali' });

/** The list item is the detail without the address count. */
const listItem = (detail: Detail): Schema<'AdminCustomerDto'> => ({
  id: detail.id,
  userId: detail.userId,
  email: detail.email,
  firstName: detail.firstName,
  lastName: detail.lastName,
  phone: detail.phone,
  userStatus: detail.userStatus,
  createdAt: detail.createdAt,
});

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

function serveCustomers(rows: Schema<'AdminCustomerDto'>[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/customers',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function serveCustomer(initial: Detail) {
  const state = { customer: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/customers/{customerId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.customer);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

describe('customers (spec 03 AD-25, T-M2)', { timeout: 15_000 }, () => {
  it('rows: name → AD-26, email, phone, status; filters from the URL', async () => {
    const queries = serveCustomers([listItem(MONA)]);
    renderWithProviders(<CustomersList params={{ name: 'Mona', phone: '+201012345678' }} />);
    const table = await screen.findByRole('table', { name: 'Customers' });
    expect((await within(table).findByRole('link', { name: 'Mona Ali' })).getAttribute('href')).toBe(
      `/customers/${MONA.id}`,
    );
    expect(within(table).getByText('+201012345678')).toBeDefined();
    expect(within(table).getByText('Active')).toBeDefined();
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '20',
      sort: '-createdAt',
      'name[like]': 'Mona',
      'phone[eq]': '+201012345678',
    });
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveProperty('value', '1012345678');
  });

  it('a phone is searched only once it is a whole number', async () => {
    serveCustomers([listItem(MONA)]);
    const view = renderWithProviders(<CustomersList params={{}} />);
    await screen.findByRole('link', { name: 'Mona Ali' });
    const phone = screen.getByRole('textbox', { name: 'Phone' });
    await view.user.type(phone, '10123');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(router.replace).not.toHaveBeenCalled();
    await view.user.type(phone, '45678');
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/customers?phone=%2B201012345678');
    });
  });

  it('empty with filters offers "Clear filters"', async () => {
    serveCustomers([]);
    renderWithProviders(<CustomersList params={{ name: 'Nobody' }} />);
    expect(await screen.findByText('No customers match these filters.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/customers');
  });
});

describe('customer (spec 03 AD-26, T-M2)', { timeout: 15_000 }, () => {
  it('details and the orders, returns and reviews of this customer', async () => {
    serveCustomer(MONA);
    renderWithProviders(<CustomerDetail customerId={MONA.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Mona Ali' })).toBeDefined();
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('Saved addresses').closest('div')?.textContent).toBe('Saved addresses2');
    const activity = screen.getByRole('region', { name: 'Activity' });
    expect(within(activity).getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe(
      `/orders?status=all&customer=${MONA.id}`,
    );
    expect(within(activity).getByRole('link', { name: 'Returns' }).getAttribute('href')).toBe(
      `/returns?customer=${MONA.id}`,
    );
    expect(within(activity).getByRole('link', { name: 'Reviews' }).getAttribute('href')).toBe(
      `/reviews?customer=${MONA.id}`,
    );
  });

  it('suspend uses the user id, then the customer is read again', async () => {
    const state = serveCustomer(MONA);
    const suspended: string[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/suspend',
        ({ params, reply }) => {
          suspended.push(String(params.userId));
          state.customer = { ...MONA, userStatus: 'suspended' };
          return reply.ok({ id: MONA.userId, email: MONA.email, role: 'customer', status: 'suspended' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(
      <>
        <CustomerDetail customerId={MONA.id} />
        <Toaster />
      </>,
    );
    await view.user.click(await screen.findByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend customer' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Chargebacks');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeDefined();
    expect(suspended).toEqual([MONA.userId]);
    expect(state.reads).toBeGreaterThanOrEqual(2);
  });

  it('reactivate a suspended customer', async () => {
    const state = serveCustomer({ ...MONA, userStatus: 'suspended' });
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/reactivate',
        ({ reply }) => {
          state.customer = MONA;
          return reply.ok({ id: MONA.userId, email: MONA.email, role: 'customer', status: 'active' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(
      <>
        <CustomerDetail customerId={MONA.id} />
        <Toaster />
      </>,
    );
    await view.user.click(await screen.findByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText(`${MONA.email} can sign in again.`)).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Suspend' })).toBeDefined();
  });

  it('an unknown customer is "not found"; other failures offer a retry', async () => {
    server.use(
      mockApi('get', '/admin/customers/{customerId}', ({ reply }) => reply.error(404, 'CUSTOMER_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    const first = renderWithProviders(<CustomerDetail customerId={MONA.id} />);
    expect(await screen.findByText("This customer doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to customers' }).getAttribute('href')).toBe('/customers');
    first.unmount();
    server.use(
      mockApi('get', '/admin/customers/{customerId}', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<CustomerDetail customerId={MONA.id} />);
    expect(await screen.findByText("This customer couldn't be loaded.")).toBeDefined();
  });
});

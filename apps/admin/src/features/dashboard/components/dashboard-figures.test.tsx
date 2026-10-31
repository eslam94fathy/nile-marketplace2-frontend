// @vitest-environment jsdom
import { dashboardFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DashboardFigures } from './dashboard-figures';

const server = setupMswServer();

// Intl may separate "EGP" and the amount with a no-break space.
const plain = (value: string | null) => (value ?? '').replace(/\s/g, ' ');

function mockFigures(...answers: ReturnType<typeof dashboardFactory>[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/admin/dashboard',
      ({ reply }) => {
        const answer = answers[Math.min(calls, answers.length - 1)] ?? dashboardFactory();
        calls += 1;
        return reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

describe('dashboard figures (spec 03 §7.3 AD-02 "Today", T-M1)', () => {
  it('orders: placed today and in 7 days; open seller orders labelled, only "Awaiting payment" linked', async () => {
    mockFigures(dashboardFactory());
    renderWithProviders(<DashboardFigures />);
    const orders = await screen.findByRole('region', { name: 'Orders' });
    const term = (label: string) => within(orders).getByText(label).closest('div');
    expect(term('Placed today')?.textContent).toBe('Placed today7');
    expect(term('Placed in the last 7 days')?.textContent).toBe('Placed in the last 7 days41');
    expect(term('Placed (awaiting seller)')?.textContent).toBe('Placed (awaiting seller)5');
    expect(within(orders).getByRole('link', { name: 'Awaiting payment' }).getAttribute('href')).toBe(
      '/orders?status=awaiting-payment',
    );
    expect(within(orders).getAllByRole('link')).toHaveLength(1);
  });

  it('sales: 30 days most recent first, the table carries the amounts and the bars are hidden', async () => {
    mockFigures(dashboardFactory());
    renderWithProviders(<DashboardFigures />);
    const table = await screen.findByRole('table', { name: /Sales per day/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(31);
    const [, latest, previous] = rows;
    expect(plain(within(latest ?? document.body).getByRole('rowheader').textContent)).toMatch(
      /31 Oct 2026|31\/10\/2026/,
    );
    expect(plain(latest?.textContent ?? null)).toContain('EGP 1,200.00');
    expect(plain(previous?.textContent ?? null)).toContain('EGP 150.00');
    // The largest amount draws a full bar; zero draws none.
    const bars = [...(latest?.querySelectorAll('svg[aria-hidden="true"] rect') ?? [])];
    expect(bars.map((bar) => bar.getAttribute('width'))).toEqual(['100.00%']);
  });

  it('top sellers link to AD-05; groups show the API figures as they are', async () => {
    const figures = dashboardFactory();
    mockFigures(figures);
    renderWithProviders(<DashboardFigures />);
    const top = await screen.findByRole('region', { name: 'Top sellers' });
    expect(within(top).getByRole('link', { name: 'Cairo Crafts' }).getAttribute('href')).toBe(
      `/sellers/${figures.topSellers[0]?.sellerId ?? ''}`,
    );
    const sellers = screen.getByRole('region', { name: 'Sellers' });
    expect(within(sellers).getByRole('link', { name: 'Waiting for approval' }).getAttribute('href')).toBe(
      '/sellers',
    );
    const support = screen.getByRole('region', { name: 'Support' });
    expect(within(support).getByText('Past the 24-hour target').closest('div')?.textContent).toBe(
      'Past the 24-hour target1',
    );
    const delivery = screen.getByRole('region', { name: 'Delivery' });
    expect(within(delivery).getByRole('link', { name: 'Awaiting assignment' }).getAttribute('href')).toBe(
      '/delivery/shipments',
    );
    const returns = screen.getByRole('region', { name: 'Open returns' });
    expect(within(returns).getByText('Disputed by seller').closest('div')?.textContent).toBe(
      'Disputed by seller1',
    );
    const finance = screen.getByRole('region', { name: 'Finance' });
    expect(plain(within(finance).getByText('Owed to sellers').closest('div')?.textContent ?? null)).toBe(
      'Owed to sellersEGP 18,450.75',
    );
  });

  it('no delivered sales: a sentence instead of the top sellers list', async () => {
    mockFigures(dashboardFactory({ topSellers: [] }));
    renderWithProviders(<DashboardFigures />);
    const top = await screen.findByRole('region', { name: 'Top sellers' });
    expect(within(top).getByText('No delivered sales in the last 30 days.')).toBeDefined();
  });

  it('"Figures from" names the computation time; "Refresh" reads them again', async () => {
    const calls = mockFigures(
      dashboardFactory(),
      dashboardFactory({ generatedAt: '2026-10-31T09:30:00.000Z', sellers: { pendingApproval: 9 } }),
    );
    renderWithProviders(<DashboardFigures />);
    expect(await screen.findByText(/^Figures from /)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh the figures' }));
    const sellers = screen.getByRole('region', { name: 'Sellers' });
    expect(
      await within(sellers).findByText((_, node) => node?.tagName === 'DD' && node.textContent === '9'),
    ).toBeDefined();
    expect(calls()).toBe(2);
  });

  it('an error offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/dashboard', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<DashboardFigures />);
    expect(await screen.findByText("The figures couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });
});

// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CommissionSettings } from './commission-settings';

const server = setupMswServer();

describe('default commission (spec 03 AD-06)', { timeout: 15_000 }, () => {
  it('shows the rate; a change is confirmed first, sent as a fraction, then shown', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/settings/commission',
        ({ reply }) => reply.ok({ defaultCommissionRate: '0.1000', updatedAt: '2026-10-14T08:00:00.000Z' }),
        { base: BFF_BASE },
      ),
    );
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'put',
        '/admin/settings/commission',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok({ defaultCommissionRate: '0.0850', updatedAt: '2026-10-15T08:00:00.000Z' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(
      <>
        <CommissionSettings />
        <Toaster />
      </>,
    );
    expect(await screen.findByText('10%')).toBeDefined();
    const rate = screen.getByRole('textbox', { name: /^New default rate/ });
    await view.user.clear(rate);
    await view.user.type(rate, '8.5');
    await view.user.click(screen.getByRole('button', { name: 'Save default rate' }));
    const dialog = screen.getByRole('dialog', { name: 'Change the default commission' });
    expect(
      within(dialog).getByText(
        'Set the default commission to 8.5%? Applies to sellers who register from now on. Existing sellers keep their own rate.',
      ),
    ).toBeDefined();
    expect(bodies).toEqual([]);
    await view.user.click(within(dialog).getByRole('button', { name: 'Save default rate' }));
    expect(await screen.findByText('The default commission is now 8.5%.')).toBeDefined();
    expect(bodies).toEqual([{ defaultCommissionRate: '0.0850' }]);
    expect(screen.getByText('8.5%')).toBeDefined();
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/admin/settings/commission', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<CommissionSettings />);
    expect(await screen.findByText("The commission setting couldn't be loaded.")).toBeDefined();
  });
});

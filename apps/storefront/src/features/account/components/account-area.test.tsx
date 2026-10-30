// @vitest-environment jsdom
import type * as Notifications from '@nile/notifications';
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { AccountArea } from './account-area';

const session = vi.hoisted(() => ({ present: false, signOut: vi.fn() }));
vi.mock('@/lib/session-client', () => ({
  sessionClient: { hasSession: () => session.present, signOut: session.signOut },
}));

// The bell has its own tests in @nile/notifications; here only whether the header shows it.
vi.mock('@nile/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  NotificationBell: () => <button type="button">Notifications bell</button>,
}));

const server = setupMswServer();

beforeEach(() => {
  session.present = false;
  session.signOut.mockReset();
});

const PROFILE = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'mona@example.test',
  firstName: 'Mona',
  lastName: 'Ali',
  phone: '+201012345678',
  createdAt: '2026-10-14T08:00:00.000Z',
};

describe('header account area (spec 01 §2.2)', () => {
  it('signed out: sign-in links with returnTo, cart asks to sign in, and no profile request', () => {
    // MSW fails the test on any request without a handler, so no /me call can slip through.
    renderWithProviders(<AccountArea pathname="/p/red-shirt" />);
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/login?returnTo=%2Fp%2Fred-shirt',
    );
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/register?returnTo=%2Fp%2Fred-shirt',
    );
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('href')).toBe('/login?returnTo=%2Fcart');
    expect(screen.queryByRole('button', { name: 'Notifications bell' })).toBeNull();
  });

  it('signed in: greets by first name; the menu has the account pages and sign-out', async () => {
    session.present = true;
    server.use(mockApi('get', '/me', ({ reply }) => reply.ok(PROFILE), { base: BFF_BASE }));
    const view = renderWithProviders(<AccountArea pathname="/" />);
    const trigger = await screen.findByRole('button', { name: 'Hi, Mona' });
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('href')).toBe('/cart');
    expect(screen.getByRole('button', { name: 'Notifications bell' })).toBeDefined();

    await view.user.click(trigger);
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => [item.textContent, item.getAttribute('href')]);
    expect(items).toEqual([
      ['Orders', '/account/orders'],
      ['Wishlist', '/account/wishlist'],
      ['Notifications', '/account/notifications'],
      ['Addresses', '/account/addresses'],
      ['Account', '/account'],
      ['Security', '/account/security'],
      ['Sign out', null],
    ]);
    await view.user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    // The header's heart link (spec 01 §10.3).
    expect(screen.getByRole('link', { name: 'Wishlist' }).getAttribute('href')).toBe('/account/wishlist');
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });

  it('signed in but the profile is unavailable: the menu still works under "Account"', async () => {
    session.present = true;
    server.use(mockApi('get', '/me', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }));
    const view = renderWithProviders(<AccountArea pathname="/" />);
    await view.user.click(await screen.findByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeDefined();
  });
});

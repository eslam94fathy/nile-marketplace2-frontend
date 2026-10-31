// @vitest-environment jsdom
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountFrame, AccountMenu } from './account-nav';

const pathname = vi.hoisted(() => ({ current: '/account' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const session = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/session-client', () => ({ sessionClient: { signOut: session.signOut } }));

beforeEach(() => {
  pathname.current = '/account';
  session.signOut.mockReset();
});

const ENTRIES = [
  ['Profile', '/account'],
  ['Orders', '/account/orders'],
  ['Returns', '/account/returns'],
  ['Reviews', '/account/reviews'],
  ['Wishlist', '/account/wishlist'],
  ['Addresses', '/account/addresses'],
  ['Notifications', '/account/notifications'],
  ['Help & support', '/account/support'],
  ['Security', '/account/security'],
];

function links(nav: HTMLElement) {
  return within(nav)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('account navigation (spec 01 SF-Q-13)', () => {
  it('desktop side navigation: the nine sections in order, with the page content', () => {
    renderWithProviders(
      <AccountFrame>
        <h1>Your orders</h1>
      </AccountFrame>,
    );
    expect(links(screen.getByRole('navigation', { name: 'Your account' }))).toEqual(ENTRIES);
    expect(screen.getByRole('heading', { name: 'Your orders' })).toBeDefined();
  });

  it.each([
    ['/account', 'Profile'],
    ['/account/orders/o-1/return', 'Orders'],
    ['/account/notifications/settings', 'Notifications'],
    ['/account/returns/r-1', 'Returns'],
  ])('%s marks %s as the current section, and only it', (path, label) => {
    pathname.current = path;
    renderWithProviders(<AccountFrame>content</AccountFrame>);
    const current = within(screen.getByRole('navigation', { name: 'Your account' }))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(current).toEqual([label]);
  });

  it('phones: a link back to the account menu above the page', () => {
    pathname.current = '/account/orders';
    renderWithProviders(<AccountFrame>content</AccountFrame>);
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account/menu');
  });

  it('the menu page gets neither the side navigation nor the back link', () => {
    pathname.current = '/account/menu';
    renderWithProviders(
      <AccountFrame>
        <AccountMenu />
      </AccountFrame>,
    );
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
  });

  it('menu page: the nine sections, then sign-out', async () => {
    const view = renderWithProviders(<AccountMenu />);
    expect(links(screen.getByRole('navigation', { name: 'Your account' }))).toEqual(ENTRIES);
    await view.user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });
});

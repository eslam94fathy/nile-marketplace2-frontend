// @vitest-environment jsdom
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontAuthScreens } from '@/features/auth';
import { mockAuthRoute, setupMswServer } from '@/test/msw';
import { goToSignIn } from '../lib/navigation';
import { InviteForm } from './invite-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Spy mode: jsdom can't navigate to another origin.
vi.mock('../lib/navigation', { spy: true });

const server = setupMswServer();

const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  vi.mocked(goToSignIn)
    .mockReset()
    .mockImplementation(() => undefined);
});

function openLink(search: string) {
  window.history.replaceState(null, '', `/invite${search}`);
  return renderWithProviders(
    <StorefrontAuthScreens>
      <InviteForm />
    </StorefrontAuthScreens>,
  );
}

async function setPassword(
  view: ReturnType<typeof openLink>,
  password = ' new password ',
  confirm = password,
) {
  await view.user.type(await screen.findByLabelText(/^New password/), password);
  await view.user.type(screen.getByLabelText(/^Confirm new password/), confirm);
  await view.user.click(screen.getByRole('button', { name: 'Set password' }));
}

// Fields typed key by key: slow in jsdom when the whole suite runs in parallel.
describe('SF-20 Invite landing', { timeout: 15_000 }, () => {
  it('removes the token from the address bar as soon as it is read', async () => {
    openLink(`?token=${TOKEN}&utm=x`);
    await screen.findByLabelText(/^New password/);
    expect(window.location.search).toBe('?utm=x');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it.each([
    ['admin', 'http://admin.test/login?notice=invited&email=new%40example.test'],
    ['delivery_agent', 'http://agent.test/login?notice=invited&email=new%40example.test'],
  ])('a %s sets the password (untrimmed) and is sent to their own sign-in page', async (role, target) => {
    const invite = mockAuthRoute('invite', { ok: { role, email: 'new@example.test' } });
    server.use(invite.handler);
    const view = openLink(`?token=${TOKEN}`);
    await setPassword(view);
    await vi.waitFor(() => {
      expect(goToSignIn).toHaveBeenCalledWith(target);
    });
    expect(invite.bodies).toEqual([{ token: TOKEN, password: ' new password ' }]);
  });

  it('an expired or used invite → "ask an admin to send a new one", and no retry', async () => {
    server.use(mockAuthRoute('invite', { error: 'INVALID_INVITE_TOKEN', status: 400 }).handler);
    const view = openLink(`?token=${TOKEN}`);
    await setPassword(view);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This invitation has expired or was already used. Ask an admin to send a new one.',
    );
    expect(screen.getByRole('button', { name: 'Set password' }).hasAttribute('disabled')).toBe(true);
    expect(goToSignIn).not.toHaveBeenCalled();
  });

  it.each(['', '?token=short', `?token=${TOKEN}x`])(
    'a link without a valid token (%s) is refused at once',
    async (search) => {
      openLink(search);
      expect((await screen.findByRole('alert')).textContent).toBe('This invitation link is invalid.');
      expect(screen.queryByLabelText(/^New password/)).toBeNull();
    },
  );

  it('checks the password rules and the confirmation before calling the API', async () => {
    const view = openLink(`?token=${TOKEN}`);
    await setPassword(view, 'short', 'other');
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeDefined();
    expect(screen.getByText("The passwords don't match.")).toBeDefined();
  });
});

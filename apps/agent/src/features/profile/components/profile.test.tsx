// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { agentProfileFactory, fixtureId, governorateFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { renderWithNotifications } from '@/test/notifications';
import { InactiveBanner } from './inactive';
import { MeView } from './me-view';
import { ShiftSwitch } from './shift-switch';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/me',
}));

const server = setupMswServer();

function serveProfile(profile: Schema<'AgentProfileDto'>) {
  const bodies: unknown[] = [];
  const state = { profile };
  server.use(
    mockApi('get', '/agent/profile', ({ reply }) => reply.ok(state.profile), { base: BFF_BASE }),
    mockApi(
      'patch',
      '/agent/availability',
      async ({ request, reply }) => {
        const body = (await request.json()) as { onShift: boolean };
        bodies.push(body);
        state.profile = { ...state.profile, onShift: body.onShift };
        return reply.ok(state.profile);
      },
      { base: BFF_BASE },
    ),
  );
  return { bodies, state };
}

const renderSwitch = () =>
  renderWithProviders(
    <>
      <ShiftSwitch />
      <InactiveBanner />
      <Toaster />
    </>,
  );

describe('shift switch (spec 04 AG-03)', { timeout: 15_000 }, () => {
  it('going on shift needs no confirmation; the switch shows the answer', async () => {
    const user = userEvent.setup();
    const { bodies } = serveProfile(agentProfileFactory({ onShift: false }));
    renderSwitch();
    await user.click(await screen.findByRole('switch', { name: 'Off shift' }));
    expect(await screen.findByText("You're on shift.")).toBeDefined();
    expect(bodies).toEqual([{ onShift: true }]);
    expect(screen.getByRole('switch', { name: 'On shift' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps keyboard focus on the switch while saving and after the off-shift question is dismissed', async () => {
    const user = userEvent.setup();
    const { bodies } = serveProfile(agentProfileFactory({ onShift: false }));
    renderSwitch();
    const off = await screen.findByRole('switch', { name: 'Off shift' });
    // Disabled until the profile has loaded.
    await waitFor(() => {
      expect(off.hasAttribute('disabled')).toBe(false);
    });
    off.focus();
    await user.keyboard(' ');
    const on = await screen.findByRole('switch', { name: 'On shift' });
    expect(bodies).toEqual([{ onShift: true }]);
    expect(document.activeElement).toBe(on);
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: 'Go off shift?' })).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(on);
  });

  it('going off shift says how many shipments are still to finish', async () => {
    const user = userEvent.setup();
    const { bodies } = serveProfile(agentProfileFactory({ onShift: true, activeShipmentCount: 2 }));
    renderSwitch();
    await user.click(await screen.findByRole('switch', { name: 'On shift' }));
    const dialog = await screen.findByRole('dialog', { name: 'Go off shift?' });
    expect(
      within(dialog).getByText("You won't get new shipments. You still need to finish the 2 you have."),
    ).toBeDefined();
    expect(bodies).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Go off shift' }));
    expect(await screen.findByText("You're off shift.")).toBeDefined();
    expect(bodies).toEqual([{ onShift: false }]);
  });

  it('AGENT_INACTIVE reads the profile again: banner shown, switch disabled', async () => {
    const user = userEvent.setup();
    const state = { profile: agentProfileFactory({ onShift: false }) };
    server.use(
      mockApi('get', '/agent/profile', ({ reply }) => reply.ok(state.profile), { base: BFF_BASE }),
      mockApi(
        'patch',
        '/agent/availability',
        ({ reply }) => {
          state.profile = { ...state.profile, status: 'inactive' };
          return reply.error(409, 'AGENT_INACTIVE');
        },
        { base: BFF_BASE },
      ),
    );
    renderSwitch();
    await user.click(await screen.findByRole('switch', { name: 'Off shift' }));
    expect(await screen.findByText('Your account is inactive. Contact your admin.')).toBeDefined();
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
  });
});

describe('me (spec 04 AG-02)', { timeout: 15_000 }, () => {
  it('details with the governorate name, the admin note, Security and Sign out', async () => {
    serveProfile(agentProfileFactory({ fullName: 'Sam Nabil' }));
    server.use(
      mockApi(
        'get',
        '/governorates',
        ({ reply }) => reply.ok([governorateFactory({ id: fixtureId(9700), name: 'Cairo' })]),
        { base: BFF_BASE },
      ),
    );
    renderWithNotifications(<MeView />);
    expect(await screen.findByText('Sam Nabil')).toBeDefined();
    expect(await screen.findByText('Cairo')).toBeDefined();
    expect(screen.getByText('To change your details, contact your admin.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Security' }).getAttribute('href')).toBe('/security');
    expect(screen.getByRole('link', { name: 'Notifications' }).getAttribute('href')).toBe(
      '/notifications/settings',
    );
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
    expect(screen.queryByText('Add to Home Screen to get notifications.')).toBeNull();
  });

  it('on iPhone / iPad outside the installed app: says push needs the Home Screen (AG-02)', async () => {
    serveProfile(agentProfileFactory());
    server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([]), { base: BFF_BASE }));
    renderWithNotifications(<MeView />, { needsInstall: true });

    expect(await screen.findByText('Add to Home Screen to get notifications.')).toBeDefined();
  });
});

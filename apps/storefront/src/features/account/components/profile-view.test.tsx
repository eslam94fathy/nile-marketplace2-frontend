// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { AccountArea } from './account-area';
import { ProfileView } from './profile-view';

vi.mock('@/lib/session-client', () => ({
  sessionClient: { hasSession: () => true, signOut: vi.fn() },
}));

const server = setupMswServer();

const PROFILE: Schema<'CustomerProfileDto'> = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'mona@example.test',
  firstName: 'Mona',
  lastName: 'Adel',
  phone: '+201001234567',
  createdAt: '2026-10-01T10:00:00.000Z',
};

function serveProfile() {
  server.use(mockApi('get', '/me', ({ reply }) => reply.ok(PROFILE), { base: BFF_BASE }));
}

/** `PATCH /me` answering with the profile merged with the body; records the bodies. */
function servePatch() {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    mockApi(
      'patch',
      '/me',
      async ({ request, reply }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return reply.ok({ ...PROFILE, ...body });
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const save = () => screen.getByRole('button', { name: 'Save' });

describe('profile (spec 01 SF-15)', { timeout: 15_000 }, () => {
  it('shows the read-only email, the fields and "Member since"; Save waits for a change', async () => {
    serveProfile();
    renderWithProviders(<ProfileView />);
    expect(await screen.findByDisplayValue('Mona')).toBeDefined();
    expect(screen.getByText('mona@example.test')).toBeDefined();
    expect(screen.getByText("Email can't be changed.")).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: /^Mobile phone/ })).toHaveProperty('value', '1001234567');
    expect(screen.getByText('Member since 1 Oct 2026')).toBeDefined();
    expect(save()).toHaveProperty('disabled', true);
  });

  it('sends only the changed fields; the header greeting and the form follow; "Profile saved."', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderWithProviders(
      <>
        <AccountArea pathname="/account" />
        <ProfileView />
        <Toaster />
      </>,
    );
    const first = await screen.findByRole('textbox', { name: /^First name/ });
    await view.user.clear(first);
    await view.user.type(first, '  Mariam ');
    await view.user.click(save());
    expect(await screen.findByText('Profile saved.')).toBeDefined();
    expect(bodies).toEqual([{ firstName: 'Mariam' }]);
    expect(await screen.findByRole('button', { name: 'Hi, Mariam' })).toBeDefined();
    await waitFor(() => {
      expect(save()).toHaveProperty('disabled', true);
    });
  });

  it('typing back the saved value (or only spaces) is not a change', async () => {
    serveProfile();
    const view = renderWithProviders(<ProfileView />);
    const last = await screen.findByRole('textbox', { name: /^Last name/ });
    await view.user.type(last, 'x');
    expect(save()).toHaveProperty('disabled', false);
    await view.user.clear(last);
    await view.user.type(last, ' Adel ');
    expect(save()).toHaveProperty('disabled', true);
  });

  it('client validation: nothing is sent', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderWithProviders(<ProfileView />);
    const phone = await screen.findByRole('textbox', { name: /^Mobile phone/ });
    await view.user.clear(phone);
    await view.user.type(phone, '123');
    await view.user.click(save());
    expect(await screen.findByText('Enter a mobile number starting with 10, 11, 12 or 15.')).toBeDefined();
    expect(bodies).toHaveLength(0);
  });

  it('VALIDATION_FAILED from the server lands on the field', async () => {
    serveProfile();
    server.use(
      mockApi(
        'patch',
        '/me',
        ({ reply }) =>
          reply.error(400, 'VALIDATION_FAILED', {
            details: [{ field: 'phone', constraint: 'matches', message: 'phone must match' }],
          }),
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<ProfileView />);
    const phone = await screen.findByRole('textbox', { name: /^Mobile phone/ });
    await view.user.clear(phone);
    await view.user.type(phone, '1101234567');
    await view.user.click(save());
    await waitFor(() => {
      expect(phone.getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('a server failure: form-level message with the reference', async () => {
    serveProfile();
    server.use(
      mockApi('patch', '/me', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    const view = renderWithProviders(<ProfileView />);
    const first = await screen.findByRole('textbox', { name: /^First name/ });
    await view.user.type(first, 'h');
    await view.user.click(save());
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('a failed load offers a retry', async () => {
    server.use(mockApi('get', '/me', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }));
    renderWithProviders(<ProfileView />);
    expect(await screen.findByText("Your profile couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDefined();
  });
});

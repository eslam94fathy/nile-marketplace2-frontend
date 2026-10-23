// @vitest-environment jsdom
import type { SessionClient } from '@nile/auth/client';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { mockAuthRoute, setupMswServer } from '../test/harness';
import { SecurityScreen } from './security-screen';

const server = setupMswServer();

function fakeSessionClient(refreshes = true) {
  return {
    refresh: vi.fn(),
    onUnauthenticated: vi.fn(() => Promise.resolve(refreshes)),
    signOut: vi.fn(() => Promise.resolve()),
    start: vi.fn(() => () => undefined),
    hasSession: vi.fn(() => true),
  } satisfies SessionClient;
}

function renderScreen(client = fakeSessionClient()) {
  return { ...renderWithProviders(<SecurityScreen sessionClient={client} />), client };
}

async function change(
  view: ReturnType<typeof renderScreen>,
  current = ' old pass ',
  next = ' new password ',
  confirm = next,
) {
  await view.user.type(screen.getByLabelText(/^Current password/), current);
  await view.user.type(screen.getByLabelText(/^New password/), next);
  await view.user.type(screen.getByLabelText(/^Confirm new password/), confirm);
  await view.user.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('Security (SF-19, SE-17, AD-23, AG-08)', { timeout: 15_000 }, () => {
  it('says that other devices are signed out', () => {
    renderScreen();
    expect(screen.getByText('Changing your password signs you out on your other devices.')).toBeDefined();
  });

  it('changes the password with both values exactly as typed, then clears the form; this session stays', async () => {
    const route = mockAuthRoute('password-change', { noContent: true });
    server.use(route.handler);
    const view = renderScreen();
    await change(view);
    await vi.waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(/^Current password/).value).toBe('');
    });
    expect(route.bodies).toEqual([{ currentPassword: ' old pass ', newPassword: ' new password ' }]);
    expect(view.client.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CURRENT_PASSWORD', 400, /^Current password/, 'Current password is incorrect.'],
    ['PASSWORD_UNCHANGED', 422, /^New password/, 'Choose a password different from your current one.'],
  ] as const)('%s → on its field', async (code, status, field, message) => {
    server.use(mockAuthRoute('password-change', { error: code, status }).handler);
    const view = renderScreen();
    await change(view);
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.getByLabelText(field).getAttribute('aria-invalid')).toBe('true');
  });

  it('an expired access token is refreshed once and the change retried', async () => {
    let calls = 0;
    server.use(
      http.post('http://localhost:3000/api/auth/password-change', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { success: false, error: { code: 'UNAUTHENTICATED', message: 'x' }, correlationId: null },
              { status: 401 },
            )
          : new HttpResponse(null, { status: 204 });
      }),
    );
    const view = renderScreen();
    await change(view);
    await vi.waitFor(() => {
      expect(calls).toBe(2);
    });
    expect(view.client.onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('INVALID_REFRESH_TOKEN → the session ended: signed out everywhere with the notice', async () => {
    server.use(mockAuthRoute('password-change', { error: 'INVALID_REFRESH_TOKEN', status: 401 }).handler);
    const view = renderScreen();
    await change(view);
    await vi.waitFor(() => {
      expect(view.client.signOut).toHaveBeenCalledWith('session-ended');
    });
  });

  it('checks the new password and its confirmation on the client', async () => {
    const view = renderScreen();
    await change(view, 'old', 'short', 'other');
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeDefined();
    expect(screen.getByText("The passwords don't match.")).toBeDefined();
  });

  it('signs out from the button', async () => {
    const view = renderScreen();
    await view.user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(view.client.signOut).toHaveBeenCalledWith();
  });
});

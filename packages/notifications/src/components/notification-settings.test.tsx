// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NotificationPreference } from '../api';
import { pushStorageKeys } from '../push';
import {
  ENDPOINT,
  fakePush,
  makeConfig,
  renderNotifications,
  setupMswServer,
  VAPID_KEY,
} from '../test/harness';
import { NotificationSettings } from './notification-settings';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };

const server = setupMswServer();

const SAVED: NotificationPreference[] = [
  { category: 'orders', pushEnabled: true },
  { category: 'shipments', pushEnabled: true },
  { category: 'support', pushEnabled: true },
  { category: 'promotions', pushEnabled: false },
];

function servePreferences(answer: 'ok' | 'error' = 'ok') {
  const bodies: unknown[] = [];
  server.use(
    mockApi('get', '/me/notification-preferences', ({ reply }) => reply.ok(SAVED)),
    mockApi('put', '/me/notification-preferences', async ({ request, reply }) => {
      const body = (await request.json()) as { preferences: NotificationPreference[] };
      bodies.push(body);
      if (answer === 'error') return reply.error(500, 'INTERNAL_ERROR');
      return reply.ok(
        SAVED.map((saved) => body.preferences.find((sent) => sent.category === saved.category) ?? saved),
      );
    }),
  );
  return bodies;
}

describe('NotificationSettings: preferences (spec 00 §12.6, NO-18)', () => {
  it('Save is disabled until something changes, then sends only the changed categories', async () => {
    const bodies = servePreferences();
    const { user } = renderNotifications(
      <NotificationSettings />,
      makeConfig({ pushEnvironment: fakePush().env }),
    );

    const offers = await screen.findByRole('switch', { name: 'Offers' }, FIRST_RENDER);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Orders' }).getAttribute('aria-checked')).toBe('true');

    await user.click(offers);
    await user.click(screen.getByRole('switch', { name: 'Support' }));
    await user.click(save);

    await waitFor(() => {
      expect(bodies).toEqual([
        {
          preferences: [
            { category: 'support', pushEnabled: false },
            { category: 'promotions', pushEnabled: true },
          ],
        },
      ]);
    });
    // Saved values become the new baseline.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    });
    expect(
      screen.getByText('Push notifications on this device and your other signed-in devices'),
    ).toBeDefined();
    expect(screen.getByText('In-app notifications can’t be turned off.')).toBeDefined();
  });

  it('a switch changed and changed back is no change', async () => {
    servePreferences();
    const { user } = renderNotifications(
      <NotificationSettings />,
      makeConfig({ pushEnvironment: fakePush().env }),
    );

    const orders = await screen.findByRole('switch', { name: 'Orders' });
    await user.click(orders);
    await user.click(orders);

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('a failed save shows the error and keeps the changes', async () => {
    servePreferences('error');
    const { user } = renderNotifications(
      <NotificationSettings />,
      makeConfig({ pushEnvironment: fakePush().env }),
    );

    await user.click(await screen.findByRole('switch', { name: 'Offers' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Offers' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a failed read shows the error with "Try again"', async () => {
    server.use(
      mockApi('get', '/me/notification-preferences', ({ reply }) => reply.error(500, 'INTERNAL_ERROR')),
    );
    renderNotifications(<NotificationSettings />, makeConfig({ pushEnvironment: fakePush().env }));

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined();
  });
});

describe('NotificationSettings: this device (spec 00 §12.6)', () => {
  it.each([
    [{ supported: false }, 'This browser can’t show notifications.'],
    [{ needsInstall: true }, 'On iPhone and iPad, add Nile to your Home Screen first.'],
  ])('%o → "%s", no button', async (options, message) => {
    servePreferences();
    renderNotifications(<NotificationSettings />, makeConfig({ pushEnvironment: fakePush(options).env }));

    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull();
  });

  it('turning on asks the browser, registers the device and offers "Turn off"; never asks on load', async () => {
    servePreferences();
    server.use(
      mockApi('get', '/push/config', ({ reply }) => reply.ok({ vapidPublicKey: VAPID_KEY })),
      mockApi('post', '/me/push-subscriptions', ({ reply }) => reply.created({})),
    );
    const push = fakePush();
    const { user } = renderNotifications(<NotificationSettings />, makeConfig({ pushEnvironment: push.env }));

    const turnOn = await screen.findByRole('button', { name: 'Turn on notifications on this device' });
    expect(push.requestPermission).not.toHaveBeenCalled();
    await user.click(turnOn);

    expect(await screen.findByText('Notifications are on for this device.')).toBeDefined();
    expect(push.storage.get(pushStorageKeys('storefront').endpoint)).toBe(ENDPOINT);

    server.use(mockApi('post', '/me/push-subscriptions/unregister', ({ reply }) => reply.noContent()));
    await user.click(screen.getByRole('button', { name: 'Turn off on this device' }));

    expect(await screen.findByRole('button', { name: 'Turn on notifications on this device' })).toBeDefined();
    expect(push.unsubscribe).toHaveBeenCalled();
  });

  it('permission denied in the prompt → the blocked message', async () => {
    servePreferences();
    const push = fakePush({ answer: 'denied' });
    const { user } = renderNotifications(<NotificationSettings />, makeConfig({ pushEnvironment: push.env }));

    await user.click(await screen.findByRole('button', { name: 'Turn on notifications on this device' }));

    expect(
      await screen.findByText('Notifications are blocked for this site in your browser settings.'),
    ).toBeDefined();
  });

  it('PUSH_ENDPOINT_NOT_ALLOWED → its message, still off', async () => {
    servePreferences();
    server.use(
      mockApi('get', '/push/config', ({ reply }) => reply.ok({ vapidPublicKey: VAPID_KEY })),
      mockApi('post', '/me/push-subscriptions', ({ reply }) => reply.error(422, 'PUSH_ENDPOINT_NOT_ALLOWED')),
    );
    const { user } = renderNotifications(
      <NotificationSettings />,
      makeConfig({ pushEnvironment: fakePush().env }),
    );

    await user.click(await screen.findByRole('button', { name: 'Turn on notifications on this device' }));

    expect(await screen.findByText('This browser’s notification service isn’t supported.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Turn on notifications on this device' })).toBeDefined();
  });
});

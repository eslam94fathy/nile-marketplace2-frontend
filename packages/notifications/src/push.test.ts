import { mockApi } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import {
  applicationServerKey,
  enablePush,
  pushStorageKeys,
  readPushState,
  unregisterPush,
  USER_AGENT_MAX_LENGTH,
} from './push';
import { api, ENDPOINT, fakePush, setupMswServer, VAPID_KEY } from './test/harness';

const server = setupMswServer();
const KEYS = pushStorageKeys('storefront');
const vapid = () => Promise.resolve(VAPID_KEY);

function registerHandler(answer: 'ok' | 'not-allowed' = 'ok') {
  const bodies: unknown[] = [];
  server.use(
    mockApi('post', '/me/push-subscriptions', async ({ request, reply }) => {
      bodies.push(await request.json());
      return answer === 'ok' ? reply.created({}) : reply.error(422, 'PUSH_ENDPOINT_NOT_ALLOWED');
    }),
  );
  return bodies;
}

describe('readPushState (spec 00 §12.6)', () => {
  it('iPhone / iPad outside the installed app comes first, then support, permission and subscription', async () => {
    expect(await readPushState(fakePush({ needsInstall: true, supported: false }).env)).toBe('needs-install');
    expect(await readPushState(fakePush({ supported: false }).env)).toBe('unsupported');

    const push = fakePush();
    expect(await readPushState(push.env)).toBe('off');
    push.permission = 'denied';
    expect(await readPushState(push.env)).toBe('denied');
    push.permission = 'granted';
    expect(await readPushState(push.env)).toBe('off');
    push.subscribed = true;
    expect(await readPushState(push.env)).toBe('on');
  });
});

describe('enablePush (design 01 §15.5)', () => {
  it('asks first, subscribes with the VAPID key, registers exactly the documented fields, remembers the endpoint', async () => {
    const bodies = registerHandler();
    const push = fakePush();

    const outcome = await enablePush({ api, app: 'storefront', env: push.env }, vapid);

    expect(outcome).toEqual({ state: 'on' });
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(push.subscribe).toHaveBeenCalledWith(applicationServerKey(VAPID_KEY));
    expect(bodies).toEqual([
      {
        endpoint: ENDPOINT,
        keys: { p256dh: 'BPublicKey_-', auth: 'authSecret' },
        userAgent: 'Mozilla/5.0 (Test)',
      },
    ]);
    expect(push.storage.get(KEYS.endpoint)).toBe(ENDPOINT);
  });

  it('a long user agent is cut to the API maximum', async () => {
    const bodies = registerHandler();
    const push = fakePush();
    const env = { ...push.env, userAgent: () => 'x'.repeat(300) };

    await enablePush({ api, app: 'storefront', env }, vapid);

    expect((bodies[0] as { userAgent: string }).userAgent).toHaveLength(USER_AGENT_MAX_LENGTH);
  });

  it('permission denied or the prompt dismissed: nothing is subscribed or sent', async () => {
    for (const [answer, expected] of [
      ['denied', { state: 'denied' }],
      ['default', { state: 'off', error: null }],
    ] as const) {
      const push = fakePush({ answer });
      expect(await enablePush({ api, app: 'storefront', env: push.env }, vapid)).toEqual(expected);
      expect(push.subscribe).not.toHaveBeenCalled();
    }
  });

  it('PUSH_ENDPOINT_NOT_ALLOWED: the browser subscription is dropped again and the error returned', async () => {
    registerHandler('not-allowed');
    const push = fakePush();

    const outcome = await enablePush({ api, app: 'storefront', env: push.env }, vapid);

    expect(outcome.state).toBe('off');
    expect(outcome).toMatchObject({ error: { code: 'PUSH_ENDPOINT_NOT_ALLOWED' } });
    expect(push.unsubscribe).toHaveBeenCalledTimes(1);
    expect(push.storage.has(KEYS.endpoint)).toBe(false);
  });
});

describe('unregisterPush (design 01 §15.5)', () => {
  function unregisterHandler(status: 204 | 500 = 204) {
    const bodies: unknown[] = [];
    server.use(
      mockApi('post', '/me/push-subscriptions/unregister', async ({ request, reply }) => {
        bodies.push(await request.json());
        return status === 204 ? reply.noContent() : reply.error(500, 'INTERNAL_ERROR');
      }),
    );
    return bodies;
  }

  it('sends the remembered endpoint, then unsubscribes and forgets it', async () => {
    const bodies = unregisterHandler();
    const push = fakePush();
    push.subscribed = true;
    push.storage.set(KEYS.endpoint, ENDPOINT);

    await unregisterPush({ api, app: 'storefront', env: push.env });

    expect(bodies).toEqual([{ endpoint: ENDPOINT }]);
    expect(push.unsubscribe).toHaveBeenCalledTimes(1);
    expect(push.storage.has(KEYS.endpoint)).toBe(false);
  });

  it('without a remembered endpoint, reads it from the browser subscription (DQ-14)', async () => {
    const bodies = unregisterHandler();
    const push = fakePush();
    push.subscribed = true;

    await unregisterPush({ api, app: 'storefront', env: push.env });

    expect(bodies).toEqual([{ endpoint: ENDPOINT }]);
  });

  it('a failed call still unsubscribes this device', async () => {
    unregisterHandler(500);
    const push = fakePush();
    push.subscribed = true;
    push.storage.set(KEYS.endpoint, ENDPOINT);

    await unregisterPush({ api, app: 'storefront', env: push.env });

    expect(push.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('nothing subscribed: no call at all', async () => {
    const push = fakePush();
    await unregisterPush({ api, app: 'storefront', env: push.env });
    expect(push.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('applicationServerKey', () => {
  it('decodes base64url without padding', () => {
    expect([...applicationServerKey('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

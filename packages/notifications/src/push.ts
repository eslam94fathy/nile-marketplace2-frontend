import { type ApiClient, type BffApp, unwrap } from '@nile/api';

// Standard Web Push for this device (design 01 §15.5, spec 00 §12.6). Asked only after the user's action;
// the subscription is registered with the backend, and unregistered before sign-out.

/** What this device can do, from the user's point of view. */
export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

/** The parts of `PushSubscription` used here. */
export interface PushSubscriptionLike {
  readonly endpoint: string;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

/** The browser, behind a seam so tests can simulate one. */
export interface PushEnvironment {
  /** Service worker, Push API and notifications in a secure context. */
  readonly supported: () => boolean;
  /** iPhone / iPad outside the installed app: push works only from the Home Screen (FR2-Q2). */
  readonly needsInstall: () => boolean;
  readonly permission: () => NotificationPermission;
  readonly requestPermission: () => Promise<NotificationPermission>;
  readonly getSubscription: () => Promise<PushSubscriptionLike | null>;
  /** Registers the service worker and subscribes (or returns the subscription that already exists). */
  readonly subscribe: (applicationServerKey: Uint8Array<ArrayBuffer>) => Promise<PushSubscriptionLike>;
  readonly storage: {
    readonly get: (key: string) => string | null;
    readonly set: (key: string, value: string) => void;
    readonly remove: (key: string) => void;
  };
  readonly userAgent: () => string;
}

/** The hand-written worker in each app's `public/` (design 01 §15.5). */
export const SERVICE_WORKER_URL = '/sw.js';
export const SERVICE_WORKER_SCOPE = '/';
/** The unregister call may delay sign-out this long at most (design 01 §15.5). */
export const UNREGISTER_TIMEOUT_MS = 3_000;
/** `RegisterPushSubscriptionDto.userAgent` maximum. */
export const USER_AGENT_MAX_LENGTH = 200;

/** Per-device keys (DQ-14: the endpoint is remembered for unregistering; the card's dismissal). */
export const pushStorageKeys = (app: BffApp) => ({
  endpoint: `nile.${app}.pushEndpoint`,
  cardDismissed: `nile.${app}.pushCardDismissed`,
});

function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS reports itself as a Mac; touch points tell them apart.
  return /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1);
}

function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** localStorage may be missing or throw (private mode, blocked storage): never fatal. */
const safeStorage: PushEnvironment['storage'] = {
  get: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Only a convenience: unregistering falls back to the browser's subscription.
    }
  },
  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up without storage.
    }
  },
};

export function browserPushEnvironment(): PushEnvironment {
  return {
    supported: () =>
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    needsInstall: () => typeof window !== 'undefined' && isAppleMobile() && !isInstalled(),
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    getSubscription: async () => {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
      return registration === undefined ? null : registration.pushManager.getSubscription();
    },
    subscribe: async (applicationServerKey) => {
      await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      return existing ?? registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    },
    storage: safeStorage,
    userAgent: () => navigator.userAgent,
  };
}

/** The device's state; `on` means permission granted and a subscription in this browser. */
export async function readPushState(env: PushEnvironment): Promise<PushState> {
  if (env.needsInstall()) return 'needs-install';
  if (!env.supported()) return 'unsupported';
  const permission = env.permission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  try {
    return (await env.getSubscription()) === null ? 'off' : 'on';
  } catch {
    return 'off';
  }
}

/** The VAPID key as the Push API wants it (base64url → bytes). */
export function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Thrown when the browser's subscription lacks what the backend needs. */
export class IncompleteSubscriptionError extends Error {
  override readonly name = 'IncompleteSubscriptionError';
}

/** `RegisterPushSubscriptionDto` from the browser's subscription: exactly the documented fields. */
function registerBody(subscription: PushSubscriptionLike, userAgent: string) {
  const { endpoint, keys } = subscription.toJSON();
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (endpoint === undefined || p256dh === undefined || auth === undefined) {
    throw new IncompleteSubscriptionError('The browser returned a subscription without keys');
  }
  const agent = userAgent.slice(0, USER_AGENT_MAX_LENGTH);
  // `expirationTime` is accepted and ignored by the backend (spec 13 NO-23): not sent.
  return { endpoint, keys: { p256dh, auth }, ...(agent === '' ? {} : { userAgent: agent }) };
}

export type EnableOutcome =
  | { readonly state: 'on' }
  | { readonly state: 'denied' }
  /** Permission prompt dismissed (`error` null), or a failure to show. */
  | { readonly state: 'off'; readonly error: unknown };

export interface PushDeps {
  readonly api: ApiClient;
  readonly app: BffApp;
  readonly env: PushEnvironment;
}

/**
 * Turns push on for this device. Must start inside the user's click: the permission prompt comes first,
 * before anything is awaited (Safari refuses a prompt outside a user gesture).
 */
export async function enablePush(
  deps: PushDeps,
  vapidPublicKey: () => Promise<string>,
): Promise<EnableOutcome> {
  const permission = await deps.env.requestPermission();
  if (permission === 'denied') return { state: 'denied' };
  if (permission !== 'granted') return { state: 'off', error: null };
  let subscription: PushSubscriptionLike | null = null;
  try {
    subscription = await deps.env.subscribe(applicationServerKey(await vapidPublicKey()));
    await unwrap(
      deps.api.POST('/api/v1/me/push-subscriptions', {
        body: registerBody(subscription, deps.env.userAgent()),
      }),
    );
    deps.env.storage.set(pushStorageKeys(deps.app).endpoint, subscription.endpoint);
    return { state: 'on' };
  } catch (error) {
    // A subscription the backend doesn't know would look "on" here and never receive anything.
    await subscription?.unsubscribe().catch(() => false);
    return { state: 'off', error };
  }
}

/** Drops this browser's subscription and the remembered endpoint; never throws. */
export async function unsubscribePushLocally({ app, env }: Omit<PushDeps, 'api'>): Promise<void> {
  try {
    const subscription = await env.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Unsupported browser or no worker: nothing subscribed.
  }
  env.storage.remove(pushStorageKeys(app).endpoint);
}

/**
 * Tells the backend to stop sending to this device, then unsubscribes locally. Used by "Turn off" and before
 * sign-out (design 01 §15.5); failures and a slow backend never block either.
 */
export async function unregisterPush(deps: PushDeps): Promise<void> {
  if (!deps.env.supported()) return;
  const endpoint =
    deps.env.storage.get(pushStorageKeys(deps.app).endpoint) ??
    (await deps.env
      .getSubscription()
      .then((subscription) => subscription?.endpoint ?? null)
      .catch(() => null));
  if (endpoint !== null) {
    try {
      await unwrap(
        deps.api.POST('/api/v1/me/push-subscriptions/unregister', {
          body: { endpoint },
          signal: AbortSignal.timeout(UNREGISTER_TIMEOUT_MS),
        }),
      );
    } catch {
      // The backend drops subscriptions that stop working (spec 13 NO-25); the device is unsubscribed anyway.
    }
  }
  await unsubscribePushLocally(deps);
}

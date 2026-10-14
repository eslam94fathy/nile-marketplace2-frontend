import { ApiError, browserTransport, createApiClient, unwrap } from '@nile/api';
import { describe, expect, it } from 'vitest';
import { MIN_REFRESH_INTERVAL_MS, sessionVersionCookieNames } from './session-client';
import { ACCESS_TTL_MS, FakeBrowser, settle, SKEW_SECONDS, START, type Tab } from './test/fake-browser';

const BFF = 'http://app.test/api/bff';

function apiFor(tab: Tab) {
  return createApiClient(
    browserTransport({
      bffBaseUrl: BFF,
      onUnauthenticated: tab.client.onUnauthenticated,
      fetch: tab.bffFetch,
    }),
  );
}

const getCart = (tab: Tab) => unwrap(apiFor(tab).GET('/api/v1/cart'));

describe('refresh coordination', () => {
  it('2 tabs × 10 concurrent calls after expiry → exactly one backend refresh, every call retried and served', async () => {
    const browser = new FakeBrowser();
    const tabs = [browser.openTab(), browser.openTab()];
    browser.advance(ACCESS_TTL_MS + 1000);

    const results = await Promise.allSettled(
      tabs.flatMap((tab) => Array.from({ length: 10 }, () => getCart(tab))),
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(browser.backendRefreshCalls).toBe(1);
    for (const tab of tabs) {
      expect(tab.assign).not.toHaveBeenCalled();
      expect(tab.clearPrivateData).not.toHaveBeenCalled();
    }
  });

  it('a tab that gets the lock after another tab refreshed does not call the BFF again', async () => {
    const browser = new FakeBrowser();
    const [a, b] = [browser.openTab(), browser.openTab()];
    browser.advance(ACCESS_TTL_MS + 1000);
    await Promise.all([a.client.refresh(), b.client.refresh()]);
    expect(browser.bffRefreshCalls).toBe(1);
    expect(browser.backendRefreshCalls).toBe(1);
  });

  it('without Web Locks, one tab still makes a single call for concurrent failures (in-tab single flight)', async () => {
    const browser = new FakeBrowser({ webLocks: false });
    const tab = browser.openTab();
    browser.advance(ACCESS_TTL_MS + 1000);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => getCart(tab)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(browser.backendRefreshCalls).toBe(1);
  });

  it('control: without Web Locks two tabs race and the backend rotates twice (why the lock exists)', async () => {
    const browser = new FakeBrowser({ webLocks: false });
    const tabs = [browser.openTab(), browser.openTab()];
    browser.advance(ACCESS_TTL_MS + 1000);
    await Promise.allSettled(tabs.map((tab) => getCart(tab)));
    expect(browser.backendRefreshCalls).toBe(2);
  });

  it('retries a failed call only once', async () => {
    const browser = new FakeBrowser();
    const tab = browser.openTab();
    browser.advance(ACCESS_TTL_MS + 1000);
    browser.refreshMode = 'unavailable';
    const error = await getCart(tab).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
    expect(browser.bffRefreshCalls).toBe(1);
  });
});

describe('session end', () => {
  it('INVALID_REFRESH_TOKEN signs out every tab: cache cleared, protected tabs to sign-in with returnTo, public tabs reloaded', async () => {
    const browser = new FakeBrowser();
    const a = browser.openTab('/account/orders', '?status=placed');
    const b = browser.openTab('/checkout');
    const publicTab = browser.openTab('/p/red-shirt');
    for (const tab of [a, b, publicTab]) tab.client.start();
    browser.advance(ACCESS_TTL_MS + 1000);
    browser.refreshMode = 'invalid';

    const error = await getCart(a).catch((e: unknown) => e);
    await settle();

    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
    expect(browser.backendRefreshCalls).toBe(1);
    expect(a.assign).toHaveBeenCalledWith(
      '/login?notice=session-ended&returnTo=%2Faccount%2Forders%3Fstatus%3Dplaced',
    );
    expect(b.assign).toHaveBeenCalledWith('/login?notice=session-ended&returnTo=%2Fcheckout');
    expect(publicTab.assign).not.toHaveBeenCalled();
    expect(publicTab.reload).toHaveBeenCalledTimes(1);
    for (const tab of [a, b, publicTab]) expect(tab.clearPrivateData).toHaveBeenCalledTimes(1);
  });

  it('keeps the session on a transient refresh failure (network, 5xx)', async () => {
    for (const mode of ['unavailable', 'network-down'] as const) {
      const browser = new FakeBrowser();
      const tab = browser.openTab();
      browser.advance(ACCESS_TTL_MS + 1000);
      browser.refreshMode = mode;
      expect(await tab.client.refresh(), mode).toBe('transient');
      expect(tab.assign).not.toHaveBeenCalled();
      expect(tab.clearPrivateData).not.toHaveBeenCalled();
    }
  });

  it('signOut ends the session on the server and in every tab; protected tabs go to the signed-out page', async () => {
    const browser = new FakeBrowser();
    const a = browser.openTab('/account');
    const b = browser.openTab('/cart');
    b.client.start();

    await a.client.signOut();
    await settle();

    expect(browser.logoutCalls).toBe(1);
    expect(a.assign).toHaveBeenCalledWith('/');
    expect(b.assign).toHaveBeenCalledWith('/');
    expect(a.clearPrivateData).toHaveBeenCalled();
    expect(b.clearPrivateData).toHaveBeenCalled();
  });

  it('signing out on a public page stays on the page', async () => {
    const browser = new FakeBrowser();
    const tab = browser.openTab('/');
    await tab.client.signOut();
    expect(tab.reload).toHaveBeenCalled();
    expect(tab.assign).not.toHaveBeenCalled();
  });
});

describe('no session', () => {
  it('a visitor who never signed in: a 401 is just a 401, nothing is refreshed and nobody is navigated', async () => {
    const browser = new FakeBrowser();
    browser.accessExpiresAt = null;
    await browser.openTab().client.signOut(); // clears the cookies the fake browser started with
    browser.logoutCalls = 0;
    const tab = browser.openTab('/');
    expect(tab.client.hasSession()).toBe(false);
    const error = await getCart(tab).catch((e: unknown) => e);
    await settle();
    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
    expect(browser.bffRefreshCalls).toBe(0);
    expect(tab.reload).not.toHaveBeenCalled();
    expect(tab.assign).not.toHaveBeenCalled();
    expect(tab.clearPrivateData).not.toHaveBeenCalled();
  });

  it('reports a session while the version cookie exists', () => {
    expect(new FakeBrowser().openTab().client.hasSession()).toBe(true);
  });
});

describe('proactive refresh timer', () => {
  const dueIn = ACCESS_TTL_MS - SKEW_SECONDS * 1000;

  it('schedules a refresh just before expiry, refreshes once, then schedules the next one', async () => {
    const browser = new FakeBrowser();
    const tab = browser.openTab();
    tab.client.start();
    expect(tab.timers.at(-1)?.ms).toBe(dueIn);

    browser.advance(dueIn);
    tab.timers.at(-1)?.callback();
    await settle();

    expect(browser.backendRefreshCalls).toBe(1);
    expect(tab.timers.at(-1)?.ms).toBe(dueIn);
    expect(tab.timers.at(-1)?.cleared).toBe(false);
  });

  it('two visible tabs firing together still rotate once', async () => {
    const browser = new FakeBrowser();
    const tabs = [browser.openTab(), browser.openTab()];
    for (const tab of tabs) tab.client.start();
    browser.advance(dueIn);
    for (const tab of tabs) tab.timers.at(-1)?.callback();
    await settle();
    expect(browser.backendRefreshCalls).toBe(1);
  });

  it('does not run while hidden and checks at once when the tab becomes visible again', async () => {
    const browser = new FakeBrowser();
    const tab = browser.openTab();
    tab.setVisible(false);
    tab.client.start();
    expect(tab.timers).toEqual([]);

    browser.advance(ACCESS_TTL_MS + 5000);
    tab.setVisible(true);
    expect(tab.timers.at(-1)?.ms).toBe(0);
    tab.timers.at(-1)?.callback();
    await settle();
    expect(browser.backendRefreshCalls).toBe(1);
  });

  it('never loops when the device clock is wrong: checks are at least the minimum interval apart', async () => {
    const browser = new FakeBrowser();
    const tab = browser.openTab();
    // The device thinks it is much later than the server: the token looks expired, the BFF says fresh.
    browser.advance(ACCESS_TTL_MS + 1000);
    browser.accessExpiresAt = browser.now + ACCESS_TTL_MS;
    tab.client.start();
    browser.now = START + 2 * ACCESS_TTL_MS; // the device clock jumps ahead again
    tab.timers.at(-1)?.callback();
    await settle();
    expect(tab.timers.at(-1)?.ms).toBeGreaterThanOrEqual(MIN_REFRESH_INTERVAL_MS - 1);
  });

  it('reschedules when another tab refreshed, and has no timer without a session', async () => {
    const browser = new FakeBrowser();
    const [a, b] = [browser.openTab(), browser.openTab()];
    b.client.start();
    const before = b.timers.length;
    browser.advance(dueIn);
    await a.client.refresh();
    await settle();
    expect(b.timers.length).toBeGreaterThan(before);
    expect(b.timers.at(-1)?.ms).toBe(dueIn);

    const signedOut = new FakeBrowser();
    signedOut.accessExpiresAt = null;
    await signedOut.openTab().client.signOut();
    const fresh = signedOut.openTab();
    fresh.client.start();
    expect(fresh.timers).toEqual([]);
  });

  it('stop() cancels the timer and stops listening to other tabs', async () => {
    const browser = new FakeBrowser();
    const [a, b] = [browser.openTab(), browser.openTab('/cart')];
    const stop = b.client.start();
    stop();
    expect(b.timers.at(-1)?.cleared).toBe(true);
    await a.client.signOut();
    await settle();
    expect(b.assign).not.toHaveBeenCalled();
  });
});

describe('session-version cookie names', () => {
  it('reads the prefixed (Secure) and unprefixed (local http) names', () => {
    expect(sessionVersionCookieNames('seller')).toEqual(['__Host-nile_seller_sv', 'nile_seller_sv']);
  });
});

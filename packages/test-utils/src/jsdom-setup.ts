// Component-test setup (Vitest `setupFiles`): checks every test's final screen with axe, unmounts after each
// test and stubs browser APIs Radix uses that jsdom lacks. Safe in node test files too: everything is guarded.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { axeViolations } from './axe';

afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

// Registered after the cleanup: Vitest runs `afterEach` hooks last-registered first, so axe sees the screen
// as the test left it (dialogs open, errors shown) before it is unmounted (T-I2: every screen, every state).
afterEach(async () => {
  if (typeof document === 'undefined' || document.body.childElementCount === 0) return;
  const violations = await axeViolations(document.body);
  if (violations.length > 0) throw new Error(`Accessibility violations:\n${violations.join('\n')}`);
});

/** Defines a no-op only where jsdom lacks the API (TypeScript's DOM types claim it always exists). */
function stub(target: object, name: string, value: unknown): void {
  if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype;
  stub(proto, 'hasPointerCapture', () => false);
  stub(proto, 'releasePointerCapture', () => undefined);
  stub(proto, 'setPointerCapture', () => undefined);
  stub(proto, 'scrollIntoView', () => undefined);
  stub(
    window,
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
}

// Component-test setup (Vitest `setupFiles`): unmounts after each test and stubs browser APIs Radix uses that
// jsdom lacks. Safe in node test files too: everything is guarded.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
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

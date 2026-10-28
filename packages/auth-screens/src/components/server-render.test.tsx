// Regression (T-D6 E2E, 2026-10-15): a click before hydration submitted the sign-in form natively as a GET,
// putting the password into the address bar. In the server render every submit button must be disabled.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthScreensProvider } from '../config';
import { makeTestConfig } from '../test/harness';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';
import { SecurityScreen } from './security-screen';
import { SignInForm } from './sign-in-form';
import { VerifyEmailForm } from './verify-email-form';

function serverHtml(ui: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthScreensProvider config={makeTestConfig().config}>{ui}</AuthScreensProvider>
    </QueryClientProvider>,
  );
}

function submitButton(html: string): string {
  const button = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0];
  if (button === undefined) throw new Error('no submit button in the server HTML');
  return button;
}

describe('server render (before hydration)', () => {
  it.each([
    ['sign in', <SignInForm key="a" returnTo={null} email={null} notice={null} />],
    [
      'verify email',
      <VerifyEmailForm key="b" email="a@b.test" returnTo={null} notice={null} codeSent={false} />,
    ],
    ['forgot password', <ForgotPasswordForm key="c" email={null} />],
    ['reset password', <ResetPasswordForm key="d" email="a@b.test" codeSent={false} />],
    [
      'change password',
      <SecurityScreen
        key="e"
        sessionClient={{
          refresh: () => Promise.resolve('ok'),
          onUnauthenticated: () => Promise.resolve(true),
          signOut: () => Promise.resolve(),
          start: () => () => undefined,
          hasSession: () => true,
          addSignOutHooks: () => () => undefined,
        }}
      />,
    ],
  ])('%s: the submit button is disabled, so nothing can be submitted natively', (_, ui) => {
    expect(submitButton(serverHtml(ui))).toMatch(/\sdisabled=""/);
  });
});

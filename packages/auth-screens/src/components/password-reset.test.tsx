// @vitest-environment jsdom
import { ApiError } from '@nile/api';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage } from '../navigation';
import { makeTestConfig, renderScreen } from '../test/harness';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

vi.mock('../navigation', { spy: true });

beforeEach(() => {
  vi.mocked(loadPage)
    .mockReset()
    .mockImplementation(() => undefined);
});

const GENERIC = 'If an active account uses this email, we sent a reset code.';

describe('Forgot password (SF-13, SE-04)', () => {
  it('always moves on to the reset screen with the email (never says whether it exists)', async () => {
    const setup = makeTestConfig();
    const view = renderScreen(<ForgotPasswordForm email=" Mona@Example.test " />, setup.config);
    await view.user.click(screen.getByRole('button', { name: 'Send code' }));
    await vi.waitFor(() => {
      expect(setup.navigate).toHaveBeenCalledWith('/reset-password?email=mona%40example.test&sent=1');
    });
    expect(setup.api.requestPasswordReset.mock.calls).toEqual([['mona@example.test']]);
  });

  it('RATE_LIMITED → countdown, button disabled', async () => {
    const setup = makeTestConfig();
    setup.api.requestPasswordReset.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'x', [], null, 12));
    const view = renderScreen(<ForgotPasswordForm email="a@b.test" />, setup.config);
    await view.user.click(screen.getByRole('button', { name: 'Send code' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts. Try again in 12 s.');
    expect(screen.getByRole('button', { name: 'Send code' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('Reset password (SF-14, SE-05)', () => {
  async function fill(
    view: ReturnType<typeof renderScreen>,
    password = ' new password ',
    confirm = password,
  ) {
    await view.user.type(screen.getByLabelText(/^Code/), '123456');
    await view.user.type(screen.getByLabelText(/^New password/), password);
    await view.user.type(screen.getByLabelText(/^Confirm new password/), confirm);
    await view.user.click(screen.getByRole('button', { name: 'Reset password' }));
  }

  it('arriving from forgot password: shows the generic notice and waits 60 s before another code', () => {
    renderScreen(<ResetPasswordForm email="a@b.test" codeSent />);
    expect(screen.getByRole('status').textContent).toBe(GENERIC);
    expect(screen.getByRole('button', { name: /Send a new code/ }).textContent).toBe(
      'Send a new code in 60 s',
    );
  });

  it('resets with email, code and the untrimmed new password, then goes to sign-in with the notice', async () => {
    const setup = makeTestConfig();
    const view = renderScreen(<ResetPasswordForm email="mona@example.test" codeSent={false} />, setup.config);
    await fill(view);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith('/login?notice=password-reset&email=mona%40example.test');
    });
    expect(setup.api.resetPassword.mock.calls).toEqual([
      [{ email: 'mona@example.test', otp: '123456', newPassword: ' new password ' }],
    ]);
  });

  it('INVALID_OTP → on the code field', async () => {
    const setup = makeTestConfig();
    setup.api.resetPassword.mockRejectedValue(new ApiError(400, 'INVALID_OTP', 'x'));
    const view = renderScreen(<ResetPasswordForm email="a@b.test" codeSent={false} />, setup.config);
    await fill(view);
    expect(await screen.findByText('This code is invalid or has expired.')).toBeDefined();
  });

  it('checks the new password and its confirmation on the client', async () => {
    const setup = makeTestConfig();
    const view = renderScreen(<ResetPasswordForm email="a@b.test" codeSent={false} />, setup.config);
    await fill(view, 'long enough', 'different!');
    expect(await screen.findByText("The passwords don't match.")).toBeDefined();
    expect(setup.api.resetPassword).not.toHaveBeenCalled();
  });

  it('"Send a new code" asks again for the same email and restarts the cooldown', async () => {
    const setup = makeTestConfig();
    const view = renderScreen(<ResetPasswordForm email="a@b.test" codeSent={false} />, setup.config);
    await view.user.click(screen.getByRole('button', { name: 'Send a new code' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /Send a new code/ }).textContent).toBe(
        'Send a new code in 60 s',
      );
    });
    expect(setup.api.requestPasswordReset.mock.calls).toEqual([['a@b.test']]);
  });
});

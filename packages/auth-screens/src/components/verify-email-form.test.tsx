// @vitest-environment jsdom
import { authTokensFactory } from '@nile/test-utils';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage } from '../navigation';
import { makeTestConfig, mockAuthRoute, renderScreen, setupMswServer } from '../test/harness';
import { VerifyEmailForm, type VerifyEmailFormProps } from './verify-email-form';

vi.mock('../navigation', { spy: true });

const server = setupMswServer();

beforeEach(() => {
  vi.mocked(loadPage)
    .mockReset()
    .mockImplementation(() => undefined);
});

function renderForm(props: Partial<VerifyEmailFormProps> = {}, setup = makeTestConfig()) {
  const view = renderScreen(
    <VerifyEmailForm
      email="mona@example.test"
      returnTo="/p/red-shirt"
      notice={null}
      codeSent={false}
      {...props}
    />,
    setup.config,
  );
  return { ...view, api: setup.api };
}

const resendButton = () => screen.getByRole('button', { name: /Resend code/ });

describe('Verify email (SF-12, SE-03)', () => {
  it('after registration: says a code was sent and waits 60 s before offering another', () => {
    renderForm({ codeSent: true });
    expect(
      screen.getByText('We sent a 6-digit code to mona@example.test. It expires in 10 minutes.'),
    ).toBeDefined();
    expect(resendButton().textContent).toBe('Resend code in 60 s');
    expect(resendButton().hasAttribute('disabled')).toBe(true);
  });

  it("shows the app's note after registration (seller: review notice)", () => {
    renderForm({ codeSent: true }, makeTestConfig({ verifyNote: 'Our team will review your application.' }));
    expect(screen.getByText('Our team will review your application.')).toBeDefined();
  });

  it('from sign-in (no code sent yet): asks to verify first and offers a code at once', () => {
    renderForm({ notice: 'email-not-verified' });
    expect(screen.getByRole('status').textContent).toBe('Please verify your email first.');
    expect(resendButton().hasAttribute('disabled')).toBe(false);
  });

  it('verifies and loads returnTo; the code is trimmed', async () => {
    const verify = mockAuthRoute('verify-email', { ok: { user: authTokensFactory().user } });
    server.use(verify.handler);
    const view = renderForm();
    await view.user.type(screen.getByLabelText(/^Code/), ' 123456 ');
    await view.user.click(screen.getByRole('button', { name: 'Verify' }));
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith('/p/red-shirt');
    });
    expect(verify.bodies).toEqual([{ email: 'mona@example.test', otp: '123456' }]);
  });

  it('INVALID_OTP → on the code field', async () => {
    server.use(mockAuthRoute('verify-email', { error: 'INVALID_OTP', status: 400 }).handler);
    const view = renderForm();
    await view.user.type(screen.getByLabelText(/^Code/), '000000');
    await view.user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('This code is invalid or has expired.')).toBeDefined();
    expect(loadPage).not.toHaveBeenCalled();
  });

  it('rejects a code that is not 6 digits without calling the API', async () => {
    const view = renderForm();
    await view.user.type(screen.getByLabelText(/^Code/), '12a');
    await view.user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter the 6-digit code.')).toBeDefined();
  });

  it('resend: one request with the email, then a 60 s cooldown', async () => {
    const view = renderForm();
    await view.user.click(resendButton());
    await vi.waitFor(() => {
      expect(resendButton().textContent).toBe('Resend code in 60 s');
    });
    expect(view.api.resendVerificationCode.mock.calls).toEqual([['mona@example.test']]);
  });

  it('without an email in the address, asks for it first', async () => {
    const view = renderForm({ email: null });
    await view.user.click(resendButton());
    expect(await screen.findByText('This field is required.')).toBeDefined();
    expect(view.api.resendVerificationCode).not.toHaveBeenCalled();
  });
});

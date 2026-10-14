// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage } from '../lib/navigation';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Spy mode: the real helpers run, except loadPage, which jsdom can't perform (no navigation).
vi.mock('../lib/navigation', { spy: true });

const server = setupMswServer();

beforeEach(() => {
  push.mockReset();
  vi.mocked(loadPage)
    .mockReset()
    .mockImplementation(() => undefined);
});

const GENERIC = { message: 'If an active account uses this email, we sent a reset code.' };

describe('SF-13 Forgot password', () => {
  it('always moves on to the reset screen with the email (never says whether it exists)', async () => {
    let body: unknown;
    server.use(
      mockApi(
        'post',
        '/auth/password/forgot',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.ok(GENERIC);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<ForgotPasswordForm email=" Mona@Example.test " />);
    await view.user.click(screen.getByRole('button', { name: 'Send code' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/reset-password?email=mona%40example.test&sent=1');
    });
    expect(body).toEqual({ email: 'mona@example.test' });
  });

  it('RATE_LIMITED → countdown, button disabled', async () => {
    server.use(
      http.post(`${BFF_BASE}/auth/password/forgot`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'x' }, correlationId: null },
          { status: 429, headers: { 'Retry-After': '12' } },
        ),
      ),
    );
    const view = renderWithProviders(<ForgotPasswordForm email="a@b.test" />);
    await view.user.click(screen.getByRole('button', { name: 'Send code' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts. Try again in 12 s.');
    expect(screen.getByRole('button', { name: 'Send code' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('SF-14 Reset password', () => {
  async function fill(
    view: ReturnType<typeof renderWithProviders>,
    password = ' new password ',
    confirm = password,
  ) {
    await view.user.type(screen.getByLabelText(/^Code/), '123456');
    await view.user.type(screen.getByLabelText(/^New password/), password);
    await view.user.type(screen.getByLabelText(/^Confirm new password/), confirm);
    await view.user.click(screen.getByRole('button', { name: 'Reset password' }));
  }

  it('arriving from SF-13: shows the generic notice and waits 60 s before another code', () => {
    renderWithProviders(<ResetPasswordForm email="a@b.test" codeSent />);
    expect(screen.getByRole('status').textContent).toBe(GENERIC.message);
    expect(screen.getByRole('button', { name: /Send a new code/ }).textContent).toBe(
      'Send a new code in 60 s',
    );
  });

  it('resets with email, code and the untrimmed new password, then goes to sign-in with the notice', async () => {
    let body: unknown;
    server.use(
      mockApi(
        'post',
        '/auth/password/reset',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<ResetPasswordForm email="mona@example.test" codeSent={false} />);
    await fill(view);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith('/login?notice=password-reset&email=mona%40example.test');
    });
    expect(body).toEqual({ email: 'mona@example.test', otp: '123456', newPassword: ' new password ' });
  });

  it('INVALID_OTP → on the code field', async () => {
    server.use(
      mockApi('post', '/auth/password/reset', ({ reply }) => reply.error(400, 'INVALID_OTP'), {
        base: BFF_BASE,
      }),
    );
    const view = renderWithProviders(<ResetPasswordForm email="a@b.test" codeSent={false} />);
    await fill(view);
    expect(await screen.findByText('This code is invalid or has expired.')).toBeDefined();
  });

  it('checks the new password and its confirmation on the client', async () => {
    const view = renderWithProviders(<ResetPasswordForm email="a@b.test" codeSent={false} />);
    await fill(view, 'long enough', 'different!');
    expect(await screen.findByText("The passwords don't match.")).toBeDefined();
  });

  it('"Send a new code" asks again for the same email and restarts the cooldown', async () => {
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/auth/password/forgot',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok(GENERIC);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<ResetPasswordForm email="a@b.test" codeSent={false} />);
    await view.user.click(screen.getByRole('button', { name: 'Send a new code' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /Send a new code/ }).textContent).toBe(
        'Send a new code in 60 s',
      );
    });
    expect(bodies).toEqual([{ email: 'a@b.test' }]);
  });
});

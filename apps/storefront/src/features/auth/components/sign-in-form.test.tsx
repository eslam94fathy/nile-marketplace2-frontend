// @vitest-environment jsdom
import { authTokensFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockAuthRoute, setupMswServer } from '@/test/msw';
import { loadPage } from '../lib/navigation';
import { SignInForm, type SignInFormProps } from './sign-in-form';

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

const user = authTokensFactory().user;

function renderForm(props: Partial<SignInFormProps> = {}) {
  return renderWithProviders(<SignInForm returnTo="/account/orders" email={null} notice={null} {...props} />);
}

async function fillAndSubmit(view: ReturnType<typeof renderForm>, email: string, password: string) {
  await view.user.type(screen.getByLabelText(/^Email/), email);
  await view.user.type(screen.getByLabelText(/^Password/), password);
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SF-10 Sign in', () => {
  it('validates before calling the API', async () => {
    const view = renderForm();
    await view.user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
  });

  it('signs in with a lower-cased email and the password exactly as typed, then loads returnTo', async () => {
    const login = mockAuthRoute('login', { ok: { user } });
    server.use(login.handler);
    const view = renderForm();
    await fillAndSubmit(view, '  User@Example.TEST ', '  my pass  ');
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith('/account/orders');
    });
    expect(login.bodies).toEqual([{ email: 'user@example.test', password: '  my pass  ' }]);
  });

  it('goes home when returnTo is missing or unsafe', async () => {
    server.use(mockAuthRoute('login', { ok: { user } }).handler);
    const view = renderForm({ returnTo: '//evil.test' });
    await fillAndSubmit(view, 'a@b.test', 'secret');
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith('/');
    });
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'Email or password is incorrect.'],
    ['ACCOUNT_SUSPENDED', 403, 'This account is suspended.'],
    ['INTERNAL_ERROR', 500, 'Something went wrong. Please try again.'],
  ] as const)('%s → "%s" in a form alert, input kept', async (code, status, message) => {
    server.use(mockAuthRoute('login', { error: code, status }).handler);
    const view = renderForm();
    await fillAndSubmit(view, 'a@b.test', 'secret');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toContain('Reference:');
    expect(screen.getByLabelText<HTMLInputElement>(/^Email/).value).toBe('a@b.test');
    expect(loadPage).not.toHaveBeenCalled();
  });

  it('EMAIL_NOT_VERIFIED → the verify step with email, notice and returnTo', async () => {
    server.use(mockAuthRoute('login', { error: 'EMAIL_NOT_VERIFIED', status: 403 }).handler);
    const view = renderForm();
    await fillAndSubmit(view, 'A@b.test', 'secret');
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        '/verify-email?email=a%40b.test&notice=email-not-verified&returnTo=%2Faccount%2Forders',
      );
    });
  });

  it('WRONG_APP → names the account type and links to its own site', async () => {
    server.use(
      mockAuthRoute('login', {
        error: 'WRONG_APP',
        status: 403,
        init: { details: [{ field: 'role', constraint: 'app', message: 'x', value: 'delivery_agent' }] },
      }).handler,
    );
    const view = renderForm();
    await fillAndSubmit(view, 'a@b.test', 'secret');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This is a delivery account. Please use the delivery site.');
    expect(screen.getByRole('link', { name: 'Go to the delivery site' }).getAttribute('href')).toBe(
      'http://agent.test',
    );
  });

  it('RATE_LIMITED → countdown message and the button stays disabled', async () => {
    server.use(
      mockAuthRoute('login', { error: 'RATE_LIMITED', status: 429, headers: { 'Retry-After': '30' } })
        .handler,
    );
    const view = renderForm();
    await fillAndSubmit(view, 'a@b.test', 'secret');
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts. Try again in 30 s.');
    expect(screen.getByRole('button', { name: 'Sign in' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the arrival notice and prefills the email', () => {
    renderForm({ notice: 'password-reset', email: 'a@b.test' });
    expect(screen.getByRole('status').textContent).toBe('Your password was changed. Please sign in.');
    expect(screen.getByLabelText<HTMLInputElement>(/^Email/).value).toBe('a@b.test');
  });

  it('keeps returnTo on the create-account link and the typed email on the forgot-password link', async () => {
    const view = renderForm();
    await view.user.type(screen.getByLabelText(/^Email/), 'a@b.test');
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/register?returnTo=%2Faccount%2Forders',
    );
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password?email=a%40b.test',
    );
  });
});

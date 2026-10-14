// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { RegisterForm } from './register-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupMswServer();

beforeEach(() => {
  push.mockReset();
});

async function fill(
  view: ReturnType<typeof renderWithProviders>,
  overrides: Partial<Record<string, string>> = {},
) {
  const values = {
    'First name': ' Mona ',
    'Last name': 'Ali',
    Email: 'Mona@Example.TEST',
    'Mobile phone': '01012345678',
    Password: ' long password ',
    'Confirm password': ' long password ',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value === '') continue;
    await view.user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
  }
  await view.user.click(screen.getByRole('button', { name: 'Create account' }));
}

// Six fields typed key by key: slow in jsdom when the whole suite runs in parallel.
describe('SF-11 Create account', { timeout: 15_000 }, () => {
  it('sends exactly the documented fields: trimmed names, lower-cased email, E.164 phone, untrimmed password', async () => {
    let body: unknown;
    server.use(
      mockApi(
        'post',
        '/auth/register/customer',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.created({
            userId: 'u-1',
            email: 'mona@example.test',
            status: 'pending_email_verification',
          });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<RegisterForm returnTo="/p/red-shirt" />);
    await fill(view);
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        '/verify-email?email=mona%40example.test&sent=1&returnTo=%2Fp%2Fred-shirt',
      );
    });
    expect(body).toEqual({
      firstName: 'Mona',
      lastName: 'Ali',
      email: 'mona@example.test',
      phone: '+201012345678',
      password: ' long password ',
    });
  });

  it('checks the rules on the client: phone prefix, password length, matching confirmation', async () => {
    const view = renderWithProviders(<RegisterForm returnTo={null} />);
    await fill(view, { 'Mobile phone': '0201234567', Password: 'short', 'Confirm password': 'other' });
    expect(await screen.findByText('Enter a mobile number starting with 10, 11, 12 or 15.')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeDefined();
    expect(screen.getByText("The passwords don't match.")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('EMAIL_ALREADY_REGISTERED → on the email field, with sign-in and reset links', async () => {
    server.use(
      mockApi(
        'post',
        '/auth/register/customer',
        ({ reply }) => reply.error(409, 'EMAIL_ALREADY_REGISTERED'),
        {
          base: BFF_BASE,
        },
      ),
    );
    const view = renderWithProviders(<RegisterForm returnTo="/cart" />);
    await fill(view);
    expect(await screen.findByText('An account with this email already exists.')).toBeDefined();
    expect(screen.getByLabelText(/^Email/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]?.getAttribute('href')).toBe(
      '/login?email=mona%40example.test&returnTo=%2Fcart',
    );
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password?email=mona%40example.test',
    );
  });

  it('VALIDATION_FAILED → the field’s own rule text, never the backend message', async () => {
    server.use(
      mockApi(
        'post',
        '/auth/register/customer',
        ({ reply }) =>
          reply.error(400, 'VALIDATION_FAILED', {
            details: [{ field: 'phone', constraint: 'matches', message: 'phone must match /^\\+20/' }],
          }),
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<RegisterForm returnTo={null} />);
    await fill(view);
    expect(await screen.findByText('Enter a mobile number starting with 10, 11, 12 or 15.')).toBeDefined();
    expect(screen.queryByText(/must match/)).toBeNull();
  });
});

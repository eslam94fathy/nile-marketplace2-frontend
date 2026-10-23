// @vitest-environment jsdom
import { governorateFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { RegisterSellerForm } from './register-form';
import { SellerAuthScreens } from './screens-provider';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupMswServer();

const CAIRO = governorateFactory({ name: 'Cairo' });
const GIZA = governorateFactory({ name: 'Giza', deliveryFee: null, isDeliverable: false });

beforeEach(() => {
  push.mockReset();
  server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([CAIRO, GIZA]), { base: BFF_BASE }));
});

const renderForm = () =>
  renderWithProviders(
    <SellerAuthScreens>
      <RegisterSellerForm />
    </SellerAuthScreens>,
  );

type View = ReturnType<typeof renderForm>;

async function fill(view: View, overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    'Business name': ' Nile Crafts ',
    'Contact phone': '01112345678',
    Email: 'Shop@Example.TEST',
    Password: ' long password ',
    'Confirm password': ' long password ',
    City: 'Cairo',
    Area: 'Zamalek',
    Street: '26th of July St',
    Building: '12',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value === '') continue;
    await view.user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
  }
  await view.user.click(await screen.findByRole('combobox', { name: /^Governorate/ }));
  await view.user.click(await screen.findByRole('option', { name: 'Giza' }));
  await view.user.click(screen.getByRole('button', { name: 'Create seller account' }));
}

function captureRegistration(
  answer:
    | 'ok'
    | { status: number; code: 'BUSINESS_NAME_TAKEN' | 'GOVERNORATE_NOT_FOUND' | 'EMAIL_ALREADY_REGISTERED' },
) {
  const bodies: unknown[] = [];
  server.use(
    mockApi(
      'post',
      '/auth/register/seller',
      async ({ request, reply }) => {
        bodies.push(await request.json());
        return answer === 'ok'
          ? reply.created({
              userId: 'u-1',
              sellerId: 's-1',
              email: 'shop@example.test',
              status: 'pending_email_verification',
              sellerStatus: 'pending_approval',
            })
          : reply.error(answer.status, answer.code);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

describe('SE-02 Register', { timeout: 20_000 }, () => {
  it('sends exactly the documented fields; any governorate can be the pickup one; empty landmark omitted', async () => {
    const bodies = captureRegistration('ok');
    const view = renderForm();
    await fill(view);
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/verify-email?email=shop%40example.test&sent=1');
    });
    expect(bodies).toEqual([
      {
        email: 'shop@example.test',
        password: ' long password ',
        businessName: 'Nile Crafts',
        contactPhone: '+201112345678',
        pickupAddress: {
          governorateId: GIZA.id,
          city: 'Cairo',
          area: 'Zamalek',
          street: '26th of July St',
          building: '12',
        },
      },
    ]);
  });

  it('sends a typed landmark, trimmed', async () => {
    const bodies = captureRegistration('ok');
    const view = renderForm();
    await fill(view, { Landmark: ' Near the bridge ' });
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect((bodies[0] as { pickupAddress: { landmark?: string } }).pickupAddress.landmark).toBe(
      'Near the bridge',
    );
  });

  it('BUSINESS_NAME_TAKEN → on the business name field', async () => {
    captureRegistration({ status: 409, code: 'BUSINESS_NAME_TAKEN' });
    const view = renderForm();
    await fill(view);
    expect(await screen.findByText('This business name is already taken.')).toBeDefined();
    expect(screen.getByLabelText(/^Business name/).getAttribute('aria-invalid')).toBe('true');
  });

  it('GOVERNORATE_NOT_FOUND → on the governorate field, and the list is reloaded', async () => {
    let loads = 0;
    server.use(
      mockApi(
        'get',
        '/governorates',
        ({ reply }) => {
          loads += 1;
          return reply.ok([CAIRO, GIZA]);
        },
        { base: BFF_BASE },
      ),
    );
    captureRegistration({ status: 422, code: 'GOVERNORATE_NOT_FOUND' });
    const view = renderForm();
    await fill(view);
    expect(
      await screen.findByText('This governorate is no longer available. Please choose again.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(loads).toBe(2);
    });
  });

  it('EMAIL_ALREADY_REGISTERED → on the email field with sign-in and reset links', async () => {
    captureRegistration({ status: 409, code: 'EMAIL_ALREADY_REGISTERED' });
    const view = renderForm();
    await fill(view);
    expect(await screen.findByText('An account with this email already exists.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password?email=shop%40example.test',
    );
  });

  it('checks the rules on the client: business name length, phone, required address, confirmation', async () => {
    const view = renderForm();
    await view.user.type(screen.getByLabelText(/^Business name/), 'A');
    await view.user.type(screen.getByLabelText(/^Password/), 'long password');
    await view.user.type(screen.getByLabelText(/^Confirm password/), 'other password');
    await view.user.click(screen.getByRole('button', { name: 'Create seller account' }));
    expect(await screen.findByText('Must be at least 2 characters.')).toBeDefined();
    expect(screen.getByText("The passwords don't match.")).toBeDefined();
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThanOrEqual(5);
    expect(push).not.toHaveBeenCalled();
  });
});

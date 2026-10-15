// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { governorateFactory, mockApi, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { BusinessIdentity } from './business-identity';
import { ProfileView } from './profile-view';

const server = setupMswServer();

const CAIRO = governorateFactory({ name: 'Cairo' });
const GIZA = governorateFactory({ name: 'Giza', deliveryFee: null, isDeliverable: false });

const PROFILE = sellerProfileFactory({
  email: 'shop@example.test',
  businessName: 'Nile Crafts',
  contactPhone: '+201112345678',
  status: 'approved',
  approvedAt: '2026-10-02T09:00:00.000Z',
  commissionRate: '0.1250',
  pickupAddress: {
    governorateId: CAIRO.id,
    city: 'Cairo',
    area: 'Zamalek',
    street: '26th of July St',
    building: '12',
    landmark: 'Next to the bakery',
  },
});

function serveProfile(data: Schema<'SellerProfileDto'> = PROFILE) {
  server.use(mockApi('get', '/seller/profile', ({ reply }) => reply.ok(data), { base: BFF_BASE }));
}

type PatchAnswer = 'ok' | { readonly status: number; readonly code: ErrorCode; readonly field?: string };

/** `PATCH /seller/profile`: records the bodies; answers with the profile merged with the body by default. */
function servePatch(answer: PatchAnswer = 'ok') {
  const bodies: Schema<'UpdateSellerProfileDto'>[] = [];
  server.use(
    mockApi(
      'patch',
      '/seller/profile',
      async ({ request, reply }) => {
        const body = (await request.json()) as Schema<'UpdateSellerProfileDto'>;
        bodies.push(body);
        if (answer !== 'ok') {
          return reply.error(
            answer.status,
            answer.code,
            answer.field === undefined
              ? {}
              : { details: [{ field: answer.field, constraint: 'maxLength', message: 'invalid' }] },
          );
        }
        const { pickupAddress, ...rest } = body;
        return reply.ok({
          ...PROFILE,
          ...rest,
          ...(pickupAddress === undefined
            ? {}
            : {
                pickupAddress: {
                  governorateId: pickupAddress.governorateId,
                  city: pickupAddress.city,
                  area: pickupAddress.area,
                  street: pickupAddress.street,
                  building: pickupAddress.building,
                  landmark: pickupAddress.landmark ?? null,
                },
              }),
        });
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

beforeEach(() => {
  server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([CAIRO, GIZA]), { base: BFF_BASE }));
});

const renderView = () =>
  renderWithProviders(
    <>
      <BusinessIdentity />
      <ProfileView />
      <Toaster />
    </>,
  );

const save = () => screen.getByRole('button', { name: 'Save' });
const textbox = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) });

describe('profile and status (spec 02 SE-07)', { timeout: 15_000 }, () => {
  it('status section: badge, approval date, commission as a percent with its note', async () => {
    serveProfile();
    renderView();
    expect(await screen.findByText('Approved on 2 Oct 2026')).toBeDefined();
    expect(screen.getByText("Nile's commission: 12.5%")).toBeDefined();
    expect(
      screen.getByText('Commission is charged on item prices only, not on the delivery fee.'),
    ).toBeDefined();
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
  });

  it('rejected: the reason is shown; no approval date', async () => {
    serveProfile({ ...PROFILE, approvedAt: null, status: 'rejected', rejectionReason: 'Blurry documents' });
    renderView();
    expect(await screen.findByText('Blurry documents')).toBeDefined();
    expect(screen.queryByText(/Approved on/)).toBeNull();
  });

  it('prefills the form; email is text only; Save waits for a change', async () => {
    serveProfile();
    renderView();
    expect(await screen.findByDisplayValue('Nile Crafts')).toBeDefined();
    expect(screen.getByText('shop@example.test')).toBeDefined();
    expect(screen.getByText("Email can't be changed.")).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull();
    expect(textbox('Contact phone')).toHaveProperty('value', '1112345678');
    expect(textbox('Landmark')).toHaveProperty('value', 'Next to the bakery');
    expect(screen.getByText('Changes apply to new orders only.')).toBeDefined();
    expect(save()).toHaveProperty('disabled', true);
  });

  it('sends only the changed top-level field; header and form follow; "Profile saved."', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderView();
    const name = await screen.findByDisplayValue('Nile Crafts');
    await view.user.clear(name);
    await view.user.type(name, '  Nile Crafts & Co ');
    await view.user.click(save());
    expect(await screen.findByText('Profile saved.')).toBeDefined();
    expect(bodies).toEqual([{ businessName: 'Nile Crafts & Co' }]);
    expect(screen.getByText('Nile Crafts & Co')).toBeDefined();
    expect(save()).toHaveProperty('disabled', true);
  });

  it('an address change sends the whole pickup address; a cleared landmark as null', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderView();
    await screen.findByDisplayValue('Nile Crafts');
    await view.user.clear(textbox('Landmark'));
    await view.user.click(save());
    // Saved: the form is reset to the answer, so there is nothing left to save.
    await vi.waitFor(() => {
      expect(save()).toHaveProperty('disabled', true);
    });
    expect(bodies).toEqual([
      {
        pickupAddress: {
          governorateId: CAIRO.id,
          city: 'Cairo',
          area: 'Zamalek',
          street: '26th of July St',
          building: '12',
          landmark: null,
        },
      },
    ]);
  });

  it('a new governorate sends the whole address too', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderView();
    await screen.findByDisplayValue('Nile Crafts');
    await view.user.click(screen.getByRole('combobox', { name: /^Governorate/ }));
    await view.user.click(await screen.findByRole('option', { name: 'Giza' }));
    await view.user.click(save());
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]?.pickupAddress).toMatchObject({
      governorateId: GIZA.id,
      landmark: 'Next to the bakery',
    });
    expect(Object.keys(bodies[0] ?? {})).toEqual(['pickupAddress']);
  });

  it('a phone typed with its leading 0 is the same number: nothing to save', async () => {
    serveProfile();
    const view = renderView();
    const phone = await screen.findByRole('textbox', { name: /^Contact phone/ });
    await view.user.clear(phone);
    await view.user.type(phone, '01112345678');
    expect(save()).toHaveProperty('disabled', true);
  });

  it('client validation: a 1-character business name is refused before sending', async () => {
    serveProfile();
    const bodies = servePatch();
    const view = renderView();
    const name = await screen.findByDisplayValue('Nile Crafts');
    await view.user.clear(name);
    await view.user.type(name, 'N');
    await view.user.click(save());
    expect(await screen.findByText('Must be at least 2 characters.')).toBeDefined();
    expect(bodies).toEqual([]);
  });

  it('BUSINESS_NAME_TAKEN on the field', async () => {
    serveProfile();
    servePatch({ status: 409, code: 'BUSINESS_NAME_TAKEN' });
    const view = renderView();
    const name = await screen.findByDisplayValue('Nile Crafts');
    await view.user.type(name, ' Two');
    await view.user.click(save());
    expect(await screen.findByText('This business name is already taken.')).toBeDefined();
  });

  it('GOVERNORATE_NOT_FOUND on the field, the list reloaded', async () => {
    serveProfile();
    servePatch({ status: 404, code: 'GOVERNORATE_NOT_FOUND' });
    let governorateCalls = 0;
    server.use(
      mockApi(
        'get',
        '/governorates',
        ({ reply }) => {
          governorateCalls += 1;
          return reply.ok([CAIRO, GIZA]);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView();
    await view.user.type(await screen.findByRole('textbox', { name: /^City/ }), ' East');
    await view.user.click(save());
    expect(
      await screen.findByText('This governorate is no longer available. Please choose again.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(governorateCalls).toBe(2);
    });
  });

  it('VALIDATION_FAILED details land on their fields', async () => {
    serveProfile();
    servePatch({ status: 400, code: 'VALIDATION_FAILED', field: 'pickupAddress.street' });
    const view = renderView();
    await view.user.type(await screen.findByRole('textbox', { name: /^Street/ }), ' 2');
    await view.user.click(save());
    expect(await screen.findByText('Must be at most 200 characters.')).toBeDefined();
  });

  it('other failures: a form alert, the input kept', async () => {
    serveProfile();
    servePatch({ status: 500, code: 'INTERNAL_ERROR' });
    const view = renderView();
    await view.user.type(await screen.findByRole('textbox', { name: /^Area/ }), ' North');
    await view.user.click(save());
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(textbox('Area')).toHaveProperty('value', 'Zamalek North');
  });

  it('profile load failure: error state with Try again', async () => {
    server.use(
      mockApi('get', '/seller/profile', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<ProfileView />);
    expect(await screen.findByText("Your profile couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});

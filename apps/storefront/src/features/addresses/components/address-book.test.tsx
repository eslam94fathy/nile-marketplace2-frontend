// @vitest-environment jsdom
import { addressFactory, fixtureId, governorateFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { Address } from '../api';
import { AddressBook } from './address-book';

const server = setupMswServer();

const CAIRO = governorateFactory({ id: fixtureId(1), name: 'Cairo', deliveryFee: '45.00' });
const ASWAN = governorateFactory({
  id: fixtureId(2),
  name: 'Aswan',
  deliveryFee: null,
  isDeliverable: false,
});

/** `GET /me/addresses` answering in turn (the last repeats); returns the number of calls. */
function serveAddresses(...answers: Address[][]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/me/addresses',
      ({ reply }) => {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        if (answer === undefined) throw new Error('no answer');
        return reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
    mockApi('get', '/governorates', ({ reply }) => reply.ok([CAIRO, ASWAN]), { base: BFF_BASE }),
  );
  return () => calls;
}

function render() {
  return renderWithProviders(
    <>
      <AddressBook />
      <Toaster />
    </>,
  );
}

describe('address book (spec 01 SF-16)', { timeout: 20_000 }, () => {
  it('cards as returned: default badge, address lines, "Not deliverable yet", actions', async () => {
    const home = addressFactory({ label: 'Home', isDefault: true, floor: '3', landmark: 'Near the mosque' });
    const farm = addressFactory({ label: 'Farm', governorateId: ASWAN.id });
    serveAddresses([home, farm]);
    render();
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const [first, second] = cards;
    if (first === undefined || second === undefined) throw new Error('cards');
    expect(within(first).getByText('Default')).toBeDefined();
    expect(
      within(first).getByText(`${home.building}, Abbas El Akkad, District 7, Nasr City, Cairo`),
    ).toBeDefined();
    expect(within(first).getByText('Floor 3 · Near the mosque')).toBeDefined();
    expect(within(first).queryByRole('button', { name: /Make .* the default/ })).toBeNull();
    expect(within(second).getByText('Not deliverable yet')).toBeDefined();
    expect(within(second).getByRole('button', { name: 'Make Farm the default' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDefined();
  });

  it('empty: says so and offers "Add address"', async () => {
    serveAddresses([]);
    render();
    expect(await screen.findByText("You haven't saved any addresses yet.")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDefined();
  });

  it('at 20: no "Add address", the limit is explained', async () => {
    serveAddresses(Array.from({ length: 20 }, () => addressFactory()));
    render();
    expect(await screen.findByText('You can save up to 20 addresses.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add address' })).toBeNull();
  });

  it('add: the form in a dialog; the first address becomes the default; the list reloads', async () => {
    const created = addressFactory({ label: 'Work', isDefault: true });
    const calls = serveAddresses([], [created]);
    let body: unknown;
    server.use(
      mockApi(
        'post',
        '/me/addresses',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.created(created);
        },
        { base: BFF_BASE },
      ),
    );
    const view = render();
    await view.user.click(await screen.findByRole('button', { name: 'Add address' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add address' });
    expect(within(dialog).getByText('This will be your default address.')).toBeDefined();
    const fill = async (name: RegExp, value: string) => {
      await view.user.type(within(dialog).getByRole('textbox', { name }), value);
    };
    await fill(/^Label/, 'Work');
    await fill(/^Recipient name/, 'Mona Adel');
    await fill(/^Recipient phone/, '1001234567');
    within(dialog)
      .getByRole('combobox', { name: /^Governorate/ })
      .focus();
    await view.user.keyboard('{Enter}');
    await view.user.click(await screen.findByRole('option', { name: 'Cairo' }));
    await fill(/^City/, 'Nasr City');
    await fill(/^Area/, 'District 7');
    await fill(/^Street/, 'Abbas El Akkad');
    await fill(/^Building/, '12');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('Work')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(body).toMatchObject({ label: 'Work', isDefault: true });
    expect(calls()).toBe(2);
  });

  it('edit: only the changed fields, a cleared optional field as null; Save waits for a change', async () => {
    const home = addressFactory({ label: 'Home', isDefault: true, floor: '3' });
    serveAddresses([home]);
    let body: unknown;
    server.use(
      mockApi(
        'patch',
        '/me/addresses/{addressId}',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.ok({ ...home, street: 'Makram Ebeid', floor: null });
        },
        { base: BFF_BASE },
      ),
    );
    const view = render();
    await view.user.click(await screen.findByRole('button', { name: 'Edit Home' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit address' });
    // The default address has no "unset default" control (spec 04).
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).getByText(/This is your default address\./)).toBeDefined();
    const save = within(dialog).getByRole('button', { name: 'Save address' });
    expect(save).toHaveProperty('disabled', true);
    const street = within(dialog).getByRole('textbox', { name: /^Street/ });
    await view.user.clear(street);
    await view.user.type(street, 'Makram Ebeid');
    await view.user.clear(within(dialog).getByRole('textbox', { name: /^Floor/ }));
    await view.user.click(save);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(body).toEqual({ street: 'Makram Ebeid', floor: null });
  });

  it('edit an address deleted elsewhere: closes, says so, reloads the list', async () => {
    const work = addressFactory({ label: 'Work' });
    const calls = serveAddresses([work], []);
    server.use(
      mockApi('patch', '/me/addresses/{addressId}', ({ reply }) => reply.error(404, 'ADDRESS_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    const view = render();
    await view.user.click(await screen.findByRole('button', { name: 'Edit Work' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit address' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Street/ }), ' 2');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('This address no longer exists.', { exact: true })).toBeDefined();
    expect(await screen.findByText("You haven't saved any addresses yet.")).toBeDefined();
    expect(calls()).toBe(2);
  });

  it('make default: PATCH { isDefault: true }, then the list reloads', async () => {
    const home = addressFactory({ label: 'Home', isDefault: true });
    const work = addressFactory({ label: 'Work' });
    serveAddresses(
      [home, work],
      [
        { ...work, isDefault: true },
        { ...home, isDefault: false },
      ],
    );
    let body: unknown;
    server.use(
      mockApi(
        'patch',
        '/me/addresses/{addressId}',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.ok({ ...work, isDefault: true });
        },
        { base: BFF_BASE },
      ),
    );
    const view = render();
    await view.user.click(await screen.findByRole('button', { name: 'Make Work the default' }));
    expect(await screen.findByRole('button', { name: 'Make Home the default' })).toBeDefined();
    expect(body).toEqual({ isDefault: true });
  });

  it('delete the default: confirm, DELETE, then "Choose a default address."', async () => {
    const home = addressFactory({ label: 'Home', isDefault: true });
    const work = addressFactory({ label: 'Work' });
    serveAddresses([home, work], [work]);
    let deleted: string | undefined;
    server.use(
      mockApi(
        'delete',
        '/me/addresses/{addressId}',
        ({ params, reply }) => {
          deleted = String(params.addressId);
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
    );
    const view = render();
    await view.user.click(await screen.findByRole('button', { name: 'Delete Home' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete address' });
    expect(
      within(confirm).getByText('Delete this address? Past orders keep their delivery address.'),
    ).toBeDefined();
    await view.user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Choose a default address.')).toBeDefined();
    expect(deleted).toBe(home.id);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('a failed load offers a retry', async () => {
    server.use(
      mockApi('get', '/me/addresses', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
      mockApi('get', '/governorates', ({ reply }) => reply.ok([CAIRO]), { base: BFF_BASE }),
    );
    render();
    expect(await screen.findByText("Your addresses couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDefined();
  });
});

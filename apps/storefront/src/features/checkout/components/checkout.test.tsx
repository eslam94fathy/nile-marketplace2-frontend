// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import type { ErrorCode } from '@nile/api';
import {
  addressFactory,
  errorBody,
  fixtureId,
  governorateFactory,
  mockApi,
  orderDetailFactory,
} from '@nile/test-utils';
import { makeTestQueryClient, renderWithProviders } from '@nile/test-utils/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, Governorate } from '@/features/addresses';
import { kashierNavigation as navigation, PENDING_PAYMENT_ORDER_KEY } from '@/features/orders';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CheckoutView } from './checkout-view';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push, refresh: vi.fn() }) }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));

const server = setupMswServer();

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
});

const CAIRO = governorateFactory({ id: fixtureId(1), name: 'Cairo', deliveryFee: '45.00' });
const ASWAN = governorateFactory({
  id: fixtureId(2),
  name: 'Aswan',
  deliveryFee: null,
  isDeliverable: false,
});

function cart(overrides: Partial<Schema<'CartDto'>> = {}): Schema<'CartDto'> {
  return {
    id: fixtureId(0x500),
    sellers: [
      {
        sellerId: fixtureId(0x600),
        businessName: 'Nile Crafts',
        subtotal: '500.00',
        items: [
          {
            id: fixtureId(0x700),
            variantId: fixtureId(0x701),
            productId: fixtureId(0x702),
            productName: 'Linen shirt',
            productSlug: 'linen-shirt',
            sku: 'LIN-M',
            attributes: [],
            unitPrice: '250.00',
            quantity: 2,
            lineTotal: '500.00',
            issue: null,
            image: null,
            availableQuantity: 10,
          },
        ],
      },
    ],
    itemsTotal: '500.00',
    itemCount: 2,
    hasIssues: false,
    ...overrides,
  };
}

function serve({
  basket = cart(),
  addresses = [] as Address[],
  governorates = [CAIRO, ASWAN] as Governorate[],
} = {}) {
  let governorateCalls = 0;
  server.use(
    mockApi('get', '/cart', ({ reply }) => reply.ok(basket), { base: BFF_BASE }),
    mockApi('get', '/me/addresses', ({ reply }) => reply.ok(addresses), { base: BFF_BASE }),
    mockApi(
      'get',
      '/governorates',
      ({ reply }) => {
        governorateCalls += 1;
        return reply.ok(governorates);
      },
      { base: BFF_BASE },
    ),
  );
  return { governorateCalls: () => governorateCalls };
}

async function fillAddressForm(user: ReturnType<typeof userEvent.setup>, governorate: string) {
  await user.type(screen.getByRole('textbox', { name: /^Label/ }), 'Work');
  await user.type(screen.getByRole('textbox', { name: /^Recipient name/ }), 'Mona Adel');
  await user.type(screen.getByRole('textbox', { name: /^Recipient phone/ }), '1001234567');
  screen.getByRole('combobox', { name: /^Governorate/ }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: governorate }));
  await user.type(screen.getByRole('textbox', { name: /^City/ }), 'Nasr City');
  await user.type(screen.getByRole('textbox', { name: /^Area/ }), 'District 7');
  await user.type(screen.getByRole('textbox', { name: /^Street/ }), 'Abbas El Akkad');
  await user.type(screen.getByRole('textbox', { name: /^Building/ }), '12');
}

const deliveryFee = () => screen.getByText('Delivery fee').nextElementSibling?.textContent;

describe('checkout: delivery address (spec 01 SF-07 §1)', { timeout: 20_000 }, () => {
  it('preselects a deliverable default address and shows its delivery fee', async () => {
    const home = addressFactory({ label: 'Home', isDefault: true });
    serve({ addresses: [home, addressFactory({ label: 'Work' })] });
    renderWithProviders(<CheckoutView />);
    expect(await screen.findByRole('radio', { name: /Home/ })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: /Work/ })).toHaveProperty('checked', false);
    expect(screen.getByText('Items (2)')).toBeDefined();
    expect(deliveryFee()).toMatch(/45\.00/);
  });

  it('does not preselect a default it cannot deliver to; that address is disabled with the reason', async () => {
    serve({
      addresses: [
        addressFactory({ label: 'Home', isDefault: true, governorateId: ASWAN.id }),
        addressFactory({ label: 'Work' }),
      ],
    });
    renderWithProviders(<CheckoutView />);
    const home = await screen.findByRole('radio', { name: /Home/ });
    expect(home).toHaveProperty('disabled', true);
    expect(home).toHaveProperty('checked', false);
    expect(screen.getByText("We don't deliver to Aswan yet.")).toBeDefined();
    expect(deliveryFee()).toBe('—');

    await userEvent.click(screen.getByRole('radio', { name: /Work/ }));
    expect(screen.getByRole('radio', { name: /Work/ })).toHaveProperty('checked', true);
    expect(deliveryFee()).toMatch(/45\.00/);
  });

  it('fetches governorates fresh even when cached (fees feed the total)', async () => {
    const calls = serve({ addresses: [addressFactory({ isDefault: true })] });
    const queryClient = makeTestQueryClient();
    // A cached, older fee (e.g. from the address book) must not be used.
    queryClient.setQueryData(['public', 'governorates', 'list'], [{ ...CAIRO, deliveryFee: '30.00' }]);
    renderWithProviders(<CheckoutView />, { queryClient });
    await waitFor(() => {
      expect(deliveryFee()).toMatch(/45\.00/);
    });
    expect(calls.governorateCalls()).toBe(1);
  });

  it('no addresses: the form is inline; the saved address becomes the default and is selected', async () => {
    const user = userEvent.setup();
    serve();
    server.use(
      mockApi(
        'post',
        '/me/addresses',
        async ({ request, reply }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body).toEqual({
            label: 'Work',
            recipientName: 'Mona Adel',
            recipientPhone: '+201001234567',
            governorateId: CAIRO.id,
            city: 'Nasr City',
            area: 'District 7',
            street: 'Abbas El Akkad',
            building: '12',
            isDefault: true,
          });
          const created = addressFactory({ label: 'Work', isDefault: true });
          // The list now holds it.
          server.use(mockApi('get', '/me/addresses', ({ reply: r }) => r.ok([created]), { base: BFF_BASE }));
          return reply.created(created);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<CheckoutView />);
    expect(await screen.findByText('This will be your default address.')).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: /default/ })).toBeNull();
    await fillAddressForm(user, 'Cairo');
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByRole('radio', { name: /Work/ })).toHaveProperty('checked', true);
    expect(deliveryFee()).toMatch(/45\.00/);
  });

  it('a new address in a governorate without delivery is saved but not selected', async () => {
    const user = userEvent.setup();
    const home = addressFactory({ label: 'Home', isDefault: true });
    serve({ addresses: [home] });
    server.use(
      mockApi(
        'post',
        '/me/addresses',
        async ({ request, reply }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.isDefault).toBe(false);
          const created = addressFactory({ label: 'Work', governorateId: ASWAN.id });
          server.use(
            mockApi('get', '/me/addresses', ({ reply: r }) => r.ok([home, created]), { base: BFF_BASE }),
          );
          return reply.created(created);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<CheckoutView />);
    await user.click(await screen.findByRole('button', { name: 'Add a new address' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a new address' });
    expect(within(dialog).getByRole('checkbox', { name: 'Make this my default address' })).toBeDefined();
    await fillAddressForm(user, 'Aswan (no delivery yet)');
    await user.click(within(dialog).getByRole('button', { name: 'Save address' }));
    const work = await screen.findByRole('radio', { name: /Work/ });
    expect(work).toHaveProperty('disabled', true);
    expect(screen.getByRole('radio', { name: /Home/ })).toHaveProperty('checked', true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('GOVERNORATE_NOT_FOUND: reloads governorates and asks to choose again', async () => {
    const user = userEvent.setup();
    const calls = serve();
    server.use(
      mockApi('post', '/me/addresses', ({ reply }) => reply.error(404, 'GOVERNORATE_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<CheckoutView />);
    await screen.findByText('This will be your default address.');
    await fillAddressForm(user, 'Cairo');
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(
      await screen.findByText('This governorate is no longer available. Please choose again.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(calls.governorateCalls()).toBe(2);
    });
  });

  it('ADDRESS_LIMIT_REACHED from the server: form-level message', async () => {
    const user = userEvent.setup();
    serve();
    server.use(
      mockApi('post', '/me/addresses', ({ reply }) => reply.error(409, 'ADDRESS_LIMIT_REACHED'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<CheckoutView />);
    await screen.findByText('This will be your default address.');
    await fillAddressForm(user, 'Cairo');
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('You have the maximum of 20 addresses.'),
    );
  });

  it('at 20 addresses: no "Add a new address", the limit is explained', async () => {
    serve({ addresses: Array.from({ length: 20 }, () => addressFactory()) });
    renderWithProviders(<CheckoutView />);
    await screen.findAllByRole('radio');
    expect(screen.queryByRole('button', { name: 'Add a new address' })).toBeNull();
    expect(screen.getByText(/You have the maximum of 20 addresses/)).toBeDefined();
  });
});

describe('checkout: entry guard and states (spec 01 SF-07)', { timeout: 15_000 }, () => {
  it('empty cart → back to the cart', async () => {
    serve({ basket: cart({ sellers: [], itemCount: 0, itemsTotal: '0.00' }) });
    renderWithProviders(<CheckoutView />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/cart');
    });
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('cart with issues → back to the cart with the notice', async () => {
    serve({ basket: cart({ hasIssues: true }), addresses: [addressFactory({ isDefault: true })] });
    renderWithProviders(<CheckoutView />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/cart?notice=needs-attention');
    });
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('a failed load shows the error with a retry', async () => {
    serve();
    server.use(
      mockApi('get', '/me/addresses', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<CheckoutView />);
    expect(await screen.findByText("Checkout couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDefined();
  });
});

// ---- T-F3: payment, review, Place order (spec 01 SF-07 §2–§3, SF-07-A1) ----

const PLACED_ORDER = orderDetailFactory();

interface Sent {
  readonly body: Record<string, unknown>;
  readonly key: string | null;
}

type Answer = () => Response | Promise<Response>;

const placed: Answer = () =>
  HttpResponse.json({ success: true, data: { order: PLACED_ORDER } }, { status: 201 });

const failWith =
  (status: number, code: ErrorCode): Answer =>
  () =>
    HttpResponse.json(errorBody(code), { status });

/** `POST /checkout` answering in turn with each answer (the last one repeats); records bodies and keys. */
function serveCheckout(...answers: Answer[]) {
  const sent: Sent[] = [];
  server.use(
    http.post(`${BFF_BASE}/checkout`, async ({ request }) => {
      sent.push({
        body: (await request.json()) as Record<string, unknown>,
        key: request.headers.get('Idempotency-Key'),
      });
      const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
      if (answer === undefined) throw new Error('no answer');
      return answer();
    }),
  );
  return sent;
}

async function chooseCod() {
  const user = userEvent.setup();
  renderWithProviders(<CheckoutView />);
  await user.click(await screen.findByRole('radio', { name: /Cash on delivery/ }));
  return user;
}

const placeButton = () => screen.getByRole('button', { name: /Place order|Placing your order/ });

describe('checkout: payment, review and Place order (spec 01 SF-07)', { timeout: 20_000 }, () => {
  it('no payment method preselected; both methods offered', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    renderWithProviders(<CheckoutView />);
    expect(await screen.findByRole('radio', { name: /Cash on delivery/ })).toHaveProperty('checked', false);
    const card = screen.getByRole('radio', { name: /Pay by card \(Kashier\)/ });
    expect(card).toHaveProperty('checked', false);
    expect(card).toHaveProperty('disabled', false);
    expect(
      screen.getByText(/You have 15 minutes to pay; until then your items are reserved\./),
    ).toBeDefined();
    expect(placeButton()).toHaveProperty('disabled', true);
    expect(
      screen.getByText('Choose a delivery address and a payment method to place your order.'),
    ).toBeDefined();
  });

  it('total = items total + delivery fee, exactly; the review groups items by seller', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    renderWithProviders(<CheckoutView />);
    await screen.findByRole('radio', { name: /Cash on delivery/ });
    expect(screen.getByText('Total').nextElementSibling?.textContent).toMatch(/545\.00/);
    const group = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(group).getByText('Linen shirt')).toBeDefined();
    expect(within(group).getByText('Qty 2')).toBeDefined();
    expect(screen.queryByText(/separate parcels/)).toBeNull();
  });

  it('several sellers: one parcel per seller, one delivery fee', async () => {
    const basket = cart();
    const first = basket.sellers[0];
    if (first === undefined) throw new Error('fixture');
    serve({
      basket: {
        ...basket,
        sellers: [first, { ...first, sellerId: fixtureId(0x601), businessName: 'Delta Home' }],
      },
      addresses: [addressFactory({ isDefault: true })],
    });
    renderWithProviders(<CheckoutView />);
    expect(
      await screen.findByText(
        'Your order will be delivered in 2 separate parcels, one per seller. You pay one delivery fee.',
      ),
    ).toBeDefined();
  });

  it('COD: sends exactly the documented body with a key, then opens the confirmation', async () => {
    const home = addressFactory({ isDefault: true });
    serve({ addresses: [home] });
    const sent = serveCheckout(placed);
    const user = await chooseCod();
    await user.click(placeButton());
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/checkout/confirmation/${PLACED_ORDER.id}`);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ addressId: home.id, paymentMethod: 'cod', expectedTotal: '545.00' });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    // The emptied cart must not bounce the shopper to /cart on the way out.
    expect(replace).not.toHaveBeenCalled();
  });

  it('a retry after a failure reuses the same key (never two orders)', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const sent = serveCheckout(failWith(500, 'INTERNAL_ERROR'), placed);
    const user = await chooseCod();
    await user.click(placeButton());
    expect(await screen.findByRole('alert')).toBeDefined();
    await user.click(placeButton());
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.key).toBe(sent[1]?.key);
  });

  it('while placing: "Placing your order…" and a second click sends nothing', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent = serveCheckout(async () => {
      await gate;
      return placed();
    });
    const user = await chooseCod();
    await user.click(placeButton());
    const busy = await screen.findByRole('button', { name: /Placing your order…/ });
    expect(busy).toHaveProperty('disabled', true);
    await user.click(busy);
    release();
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(sent).toHaveLength(1);
  });

  it('ORDER_TOTAL_CHANGED: refetches, shows the new total, places again only once confirmed, with a new key', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const sent = serveCheckout(failWith(409, 'ORDER_TOTAL_CHANGED'), placed);
    const user = await chooseCod();
    // The fee changed in the backend: the refetch brings it.
    server.use(
      mockApi('get', '/governorates', ({ reply }) => reply.ok([{ ...CAIRO, deliveryFee: '50.00' }, ASWAN]), {
        base: BFF_BASE,
      }),
    );
    await user.click(placeButton());
    const dialog = await screen.findByRole('dialog', { name: 'Your total has changed' });
    expect(
      within(dialog).getByText(/^Prices or the delivery fee changed\. Your new total is .*550\.00\.$/),
    ).toBeDefined();
    expect(sent).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Place order' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body.expectedTotal).toBe('550.00');
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it('ORDER_TOTAL_CHANGED then "Go back": nothing more is sent', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const sent = serveCheckout(failWith(409, 'ORDER_TOTAL_CHANGED'));
    const user = await chooseCod();
    await user.click(placeButton());
    const dialog = await screen.findByRole('dialog', { name: 'Your total has changed' });
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('ADDRESS_NOT_FOUND: explains, refetches addresses and clears the selection', async () => {
    const gone = addressFactory({ label: 'Home', isDefault: true });
    const other = addressFactory({ label: 'Work' });
    serve({ addresses: [gone, other] });
    serveCheckout(failWith(422, 'ADDRESS_NOT_FOUND'));
    const user = await chooseCod();
    server.use(mockApi('get', '/me/addresses', ({ reply }) => reply.ok([other]), { base: BFF_BASE }));
    await user.click(placeButton());
    expect(await screen.findByText('This address no longer exists. Please choose another.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /Home/ })).toBeNull();
    });
    expect(screen.getByRole('radio', { name: /Work/ })).toHaveProperty('checked', false);
    expect(placeButton()).toHaveProperty('disabled', true);
  });

  it('GOVERNORATE_NOT_DELIVERABLE: explains and marks the address as not deliverable', async () => {
    serve({ addresses: [addressFactory({ label: 'Home', isDefault: true })] });
    serveCheckout(failWith(422, 'GOVERNORATE_NOT_DELIVERABLE'));
    const user = await chooseCod();
    server.use(
      mockApi(
        'get',
        '/governorates',
        ({ reply }) => reply.ok([{ ...CAIRO, deliveryFee: null, isDeliverable: false }]),
        { base: BFF_BASE },
      ),
    );
    await user.click(placeButton());
    expect(await screen.findByText("We don't deliver to this area any more.")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Home/ })).toHaveProperty('disabled', true);
    });
    expect(placeButton()).toHaveProperty('disabled', true);
  });

  it.each([
    ['CART_EMPTY', 422, '/cart'],
    ['CART_HAS_ISSUES', 409, '/cart?notice=unavailable'],
    ['INSUFFICIENT_STOCK', 409, '/cart?notice=stock'],
  ] as const)('%s → back to %s', async (code, status, target) => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    serveCheckout(failWith(status, code));
    const user = await chooseCod();
    await user.click(placeButton());
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(target);
    });
  });

  it('RATE_LIMITED: the countdown message, Place order blocked meanwhile', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    serveCheckout(() =>
      HttpResponse.json(errorBody('RATE_LIMITED'), { status: 429, headers: { 'Retry-After': '30' } }),
    );
    const user = await chooseCod();
    await user.click(placeButton());
    expect(await screen.findByText(/Try again in 30 s/)).toBeDefined();
    expect(placeButton()).toHaveProperty('disabled', true);
  });
});

// ---- T-F4: card payment (spec 01 SF-07-A1 step 3, ORDER_PAYMENT_PENDING) ----

const CARD_ORDER = orderDetailFactory({
  paymentMethod: 'kashier',
  paymentStatus: 'initiated',
  status: 'pending_payment',
  paymentExpiresAt: '2026-10-15T10:15:00.000Z',
  placedAt: null,
});

const cardPlaced =
  (checkoutUrl: string | null): Answer =>
  () =>
    HttpResponse.json(
      {
        success: true,
        data: {
          order: CARD_ORDER,
          kashier: {
            expiresAt: '2026-10-15T10:15:00.000Z',
            ...(checkoutUrl === null ? {} : { checkoutUrl }),
          },
        },
      },
      { status: 201 },
    );

async function chooseCard() {
  const user = userEvent.setup();
  renderWithProviders(<CheckoutView />);
  await user.click(await screen.findByRole('radio', { name: /Pay by card/ }));
  return user;
}

describe('checkout: card payment (spec 01 SF-07-A1)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('https checkoutUrl: remembers the order for the return page, then leaves for Kashier', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const sent = serveCheckout(cardPlaced('https://checkout.kashier.io/session/abc'));
    const user = await chooseCard();
    await user.click(placeButton());
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://checkout.kashier.io/session/abc');
    });
    expect(sent[0]?.body.paymentMethod).toBe('kashier');
    expect(window.sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY)).toBe(CARD_ORDER.id);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    assign.mockRestore();
  });

  it('no checkoutUrl: opens a session for the order first', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    serve({ addresses: [addressFactory({ isDefault: true })] });
    serveCheckout(cardPlaced(null));
    server.use(
      mockApi(
        'post',
        '/orders/{orderId}/payment/kashier-session',
        ({ reply }) =>
          reply.ok({
            checkoutUrl: 'https://checkout.kashier.io/session/new',
            expiresAt: '2026-10-15T10:15:00.000Z',
          }),
        { base: BFF_BASE },
      ),
    );
    const user = await chooseCard();
    await user.click(placeButton());
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://checkout.kashier.io/session/new');
    });
    assign.mockRestore();
  });

  it('no session possible: the order page, where "Pay now" is offered', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    serve({ addresses: [addressFactory({ isDefault: true })] });
    serveCheckout(cardPlaced(null));
    server.use(
      mockApi(
        'post',
        '/orders/{orderId}/payment/kashier-session',
        ({ reply }) => reply.error(502, 'PAYMENT_PROVIDER_UNAVAILABLE'),
        { base: BFF_BASE },
      ),
    );
    const user = await chooseCard();
    await user.click(placeButton());
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/account/orders/${CARD_ORDER.id}`);
    });
    expect(assign).not.toHaveBeenCalled();
    assign.mockRestore();
  });

  it('a checkoutUrl that is not https is never followed', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    serve({ addresses: [addressFactory({ isDefault: true })] });
    serveCheckout(cardPlaced('http://checkout.kashier.io/session/abc'));
    const user = await chooseCard();
    await user.click(placeButton());
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/account/orders/${CARD_ORDER.id}`);
    });
    expect(assign).not.toHaveBeenCalled();
    assign.mockRestore();
  });

  it('ORDER_PAYMENT_PENDING: explains, links to the order waiting for payment', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const waiting = fixtureId(0x777);
    serveCheckout(() =>
      HttpResponse.json(
        errorBody('ORDER_PAYMENT_PENDING', {
          details: [
            { field: 'orderId', value: waiting, constraint: 'pending_payment', message: 'awaiting payment' },
          ],
        }),
        { status: 409 },
      ),
    );
    const user = await chooseCard();
    await user.click(placeButton());
    const dialog = await screen.findByRole('dialog', { name: 'An order is waiting for payment' });
    expect(
      within(dialog).getByText(
        'You already have an order waiting for card payment. Pay for it or wait until it expires before placing another card order.',
      ),
    ).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'Go to that order' }).getAttribute('href')).toBe(
      `/account/orders/${waiting}`,
    );
  });
});

// ---- T-K4: coupon at checkout (spec 01 SF-07-C) ----

const QUOTE: Schema<'CouponQuoteDto'> = {
  code: 'SAVE10',
  discountTotal: '50.00',
  sellerOrders: [{ sellerId: fixtureId(0x600), discount: '50.00' }],
  lines: [{ variantId: fixtureId(0x701), discount: '50.00' }],
  itemsTotalAfterDiscount: '450.00',
};

/** `POST /cart/coupon-preview` answering in turn; records the codes sent. */
function servePreview(...answers: Answer[]) {
  const codes: unknown[] = [];
  server.use(
    http.post(`${BFF_BASE}/cart/coupon-preview`, async ({ request }) => {
      codes.push(((await request.json()) as { code: unknown }).code);
      const answer = answers[Math.min(codes.length - 1, answers.length - 1)];
      if (answer === undefined) throw new Error('no answer');
      return answer();
    }),
  );
  return codes;
}

const quoted =
  (quote: Schema<'CouponQuoteDto'> = QUOTE): Answer =>
  () =>
    HttpResponse.json({ success: true, data: quote });

async function applyCoupon(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(await screen.findByRole('button', { name: 'Have a coupon?' }));
  await user.type(screen.getByRole('textbox', { name: 'Coupon code' }), code);
  await user.click(screen.getByRole('button', { name: 'Apply' }));
}

const totalRow = () => screen.getByText('Total', { selector: 'dt' }).nextElementSibling?.textContent;

describe('checkout: coupon (spec 01 SF-07-C)', { timeout: 20_000 }, () => {
  it('a malformed code is refused before any request', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const codes = servePreview(quoted());
    const user = await chooseCod();
    await applyCoupon(user, 'ab');
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid coupon code.');
    expect(codes).toEqual([]);
  });

  it('applies: trimmed and upper-cased, discount row, seller share, new total sent with couponCode', async () => {
    const home = addressFactory({ isDefault: true });
    serve({ addresses: [home] });
    const codes = servePreview(quoted());
    const sent = serveCheckout(placed);
    const user = await chooseCod();
    await applyCoupon(user, '  save10 ');
    expect(await screen.findByText('Coupon SAVE10 applied')).toBeDefined();
    expect(codes).toEqual(['SAVE10']);
    expect(screen.getByText('Coupon SAVE10').nextElementSibling?.textContent).toMatch(/^−.*50\.00$/);
    const group = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(group).getByText('Coupon discount')).toBeDefined();
    // 450.00 after the coupon + 45.00 delivery.
    expect(totalRow()).toMatch(/495\.00/);
    await user.click(placeButton());
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({
      addressId: home.id,
      paymentMethod: 'cod',
      expectedTotal: '495.00',
      couponCode: 'SAVE10',
    });
  });

  it('Remove: back to the full total, no couponCode', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    servePreview(quoted());
    const sent = serveCheckout(placed);
    const user = await chooseCod();
    await applyCoupon(user, 'SAVE10');
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(totalRow()).toMatch(/545\.00/);
    await user.click(placeButton());
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).not.toHaveProperty('couponCode');
  });

  it.each([
    ['COUPON_NOT_FOUND', "This coupon code doesn't exist."],
    ['COUPON_EXPIRED', 'This coupon has expired.'],
    ['COUPON_CUSTOMER_LIMIT_REACHED', "You've already used this coupon the maximum number of times."],
    ['COUPON_NOT_APPLICABLE', "This coupon doesn't apply to the items in your cart."],
  ] as const)('preview %s: "%s" under the field, the coupon is not applied', async (code, message) => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    servePreview(failWith(422, code));
    const user = await chooseCod();
    await applyCoupon(user, 'SAVE10');
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByText('Coupon SAVE10 applied')).toBeNull();
    expect(totalRow()).toMatch(/545\.00/);
  });

  it('COUPON_MIN_SUBTOTAL_NOT_MET: names the missing amount from the details', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    servePreview(() =>
      HttpResponse.json(
        errorBody('COUPON_MIN_SUBTOTAL_NOT_MET', {
          details: [
            { field: 'code', value: '120.50', constraint: 'min_items_subtotal', message: 'missing 120.50' },
          ],
        }),
        { status: 422 },
      ),
    );
    const user = await chooseCod();
    await applyCoupon(user, 'SAVE10');
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Add .*120\.50 more of eligible items to use this coupon\.$/,
    );
  });

  it('a coupon refused at Place order is removed; the shopper places again with a new key', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    servePreview(quoted());
    const sent = serveCheckout(failWith(422, 'COUPON_LIMIT_REACHED'), placed);
    const user = await chooseCod();
    await applyCoupon(user, 'SAVE10');
    await screen.findByText('Coupon SAVE10 applied');
    await user.click(placeButton());
    expect(
      await screen.findByText('Your coupon was removed. Check your new total and place your order again.'),
    ).toBeDefined();
    expect(screen.getByText('This coupon has been fully used.')).toBeDefined();
    expect(totalRow()).toMatch(/545\.00/);
    expect(push).not.toHaveBeenCalled();
    await user.click(placeButton());
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[1]?.body).not.toHaveProperty('couponCode');
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it('KASHIER_TOTAL_ZERO: explains, keeps the coupon, switches to cash on delivery to confirm', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    servePreview(
      quoted({ ...QUOTE, code: 'FREE', discountTotal: '500.00', itemsTotalAfterDiscount: '0.00' }),
    );
    const sent = serveCheckout(failWith(422, 'KASHIER_TOTAL_ZERO'), placed);
    const user = await chooseCard();
    await applyCoupon(user, 'FREE');
    await screen.findByText('Coupon FREE applied');
    await user.click(placeButton());
    expect(
      await screen.findByText(
        'Your total is EGP 0.00, so there is nothing to pay by card. Choose cash on delivery.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toHaveProperty('checked', true);
    expect(screen.getByText('Coupon FREE applied')).toBeDefined();
    expect(sent).toHaveLength(1);
  });

  it('a cart change asks for a new preview', async () => {
    serve({ addresses: [addressFactory({ isDefault: true })] });
    const codes = servePreview(quoted());
    const queryClient = makeTestQueryClient();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, { queryClient });
    await applyCoupon(user, 'SAVE10');
    await screen.findByText('Coupon SAVE10 applied');
    serve({ addresses: [addressFactory({ isDefault: true })], basket: cart({ itemsTotal: '750.00' }) });
    await queryClient.invalidateQueries({ queryKey: ['storefront', 'cart'] });
    await waitFor(() => {
      expect(codes).toEqual(['SAVE10', 'SAVE10']);
    });
  });
});

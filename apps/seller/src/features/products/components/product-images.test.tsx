// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import type * as Media from '@nile/media';
import {
  imageFactory,
  mediaFactory,
  mockApi,
  productImageFactory,
  sellerProductFactory,
  sellerVariantFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ProductView } from './product-view';
import { chosen, OTHER_CATEGORY_ID, serveCatalog, serveProfile, SIZE } from './products.fixtures';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@nile/media', async (importOriginal) => {
  const media = await importOriginal<typeof Media>();
  return {
    ...media,
    // jsdom can neither decode images nor make `blob:` previews.
    useImageUploads: (options: Parameters<typeof media.useImageUploads>[0]) =>
      media.useImageUploads({
        ...options,
        decode: () => Promise.resolve({ width: 800, height: 600 }),
        previews: { create: (file) => `blob:${(file as File).name}`, revoke: () => undefined },
      }),
  };
});

const server = setupMswServer();

type Product = Schema<'SellerProductDetailDto'>;
type Image = Schema<'ProductImageDto'>;

const VARIANT_M = sellerVariantFactory({ sku: 'LS-M', isDefault: false, options: [chosen(SIZE, 1)] });
const FRONT = productImageFactory({ position: 0, altText: 'Shirt, front' });
const BACK = productImageFactory({ position: 1, variantId: VARIANT_M.id });
const PRODUCT: Product = {
  ...sellerProductFactory({ name: 'Linen shirt', categoryId: OTHER_CATEGORY_ID }),
  variants: [VARIANT_M],
  images: [FRONT, BACK],
};

/** `GET /seller/products/{id}` answers with the current state; counts the calls. */
function serveProduct(initial: Product) {
  const state = { product: initial, calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/products/{productId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.product);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const fail = (status: number, code: ErrorCode) =>
  HttpResponse.json({ success: false, error: { code, message: code }, correlationId: 'corr-1' }, { status });

function serveWrite(method: 'post' | 'put' | 'patch' | 'delete', path: string, answer: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http[method](`${BFF_BASE}${path}`, async ({ request }) => {
      const text = await request.text();
      bodies.push(text === '' ? null : (JSON.parse(text) as unknown));
      return answer();
    }),
  );
  return bodies;
}

const ok = (data: unknown, status = 200) => HttpResponse.json({ success: true, data }, { status });

const STORAGE_URL = 'http://storage.test/nile-media';
const CORS = { 'Access-Control-Allow-Origin': '*' };

/** Each upload is ready at once; records the media ids. */
function serveUploads() {
  const ids: string[] = [];
  server.use(
    http.options(
      STORAGE_URL,
      () =>
        new HttpResponse(null, {
          status: 204,
          headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
        }),
    ),
    mockApi(
      'post',
      '/media/uploads',
      ({ reply }) => {
        const media = mediaFactory({ purpose: 'product_image' });
        ids.push(media.id);
        return reply.created({
          media,
          upload: { url: STORAGE_URL, fields: { key: 'k' }, expiresAt: '2999-01-01T00:00:00Z' },
        });
      },
      { base: BFF_BASE },
    ),
    http.post(STORAGE_URL, () => new HttpResponse(null, { status: 204, headers: CORS })),
    mockApi(
      'post',
      '/media/uploads/{mediaId}/complete',
      ({ params, reply }) =>
        reply.ok(mediaFactory({ id: String(params.mediaId), status: 'ready', image: imageFactory() })),
      { base: BFF_BASE },
    ),
  );
  return ids;
}

const IMAGES_PATH = `/seller/products/${PRODUCT.id}/images`;

const renderPage = () =>
  renderWithProviders(
    <>
      <ProductView productId={PRODUCT.id} />
      <Toaster />
    </>,
  );

const imageList = async () => screen.findByRole('list', { name: 'Product images' });
const tiles = async () => within(await imageList()).getAllByRole('listitem');

async function openMenu(view: ReturnType<typeof renderPage>, position: number, total: number) {
  const trigger = await screen.findByRole('button', {
    name: `Actions for image ${String(position)} of ${String(total)}`,
  });
  await waitFor(() => {
    expect(trigger.hasAttribute('disabled')).toBe(false);
  });
  await view.user.click(trigger);
}

/** The file input, once the seller's status allows adding images. */
async function picker() {
  await imageList();
  const input = screen.getByLabelText('Add images');
  await waitFor(() => {
    expect(input.hasAttribute('disabled')).toBe(false);
  });
  return input;
}

beforeEach(() => {
  router.push.mockReset();
  serveCatalog(server);
});

describe('product images (spec 02 SE-10-I)', { timeout: 15_000 }, () => {
  it('in order: main image first, the variant tie, the missing description', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    renderPage();
    const [first, second] = await tiles();
    if (first === undefined || second === undefined) throw new Error('two tiles expected');
    expect(within(first).getByText('Main image')).toBeDefined();
    expect(within(first).getByRole('img', { name: 'Shirt, front' })).toBeDefined();
    expect(within(first).queryByText('No description')).toBeNull();
    expect(within(second).getByText('Shown for: M')).toBeDefined();
    expect(within(second).getByText('No description')).toBeDefined();
    expect(within(second).getByRole('img', { name: 'Linen shirt' })).toBeDefined();
    expect(
      screen.getByText('Images help customers decide. Products can be published without images.'),
    ).toBeDefined();
  });

  it('"Make main image" sends the full new order and shows the answer', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    const bodies = serveWrite('put', `${IMAGES_PATH}/order`, () =>
      ok([
        { ...BACK, position: 0 },
        { ...FRONT, position: 1 },
      ]),
    );
    const view = renderPage();
    await openMenu(view, 2, 2);
    expect(screen.getByRole('menuitem', { name: 'Move later' }).getAttribute('aria-disabled')).toBe('true');
    await view.user.click(screen.getByRole('menuitem', { name: 'Make main image' }));
    await waitFor(() => {
      expect(bodies).toEqual([{ imageIds: [BACK.id, FRONT.id] }]);
    });
    expect(await screen.findByText('Image moved to position 1 of 2.')).toBeDefined();
    const [first] = await tiles();
    if (first === undefined) throw new Error('tile expected');
    expect(within(first).getByText('Shown for: M')).toBeDefined();
    expect(within(first).getByText('Main image')).toBeDefined();
  });

  it('PRODUCT_IMAGE_ORDER_INVALID: reads the product again and explains', async () => {
    serveProfile(server);
    const state = serveProduct(PRODUCT);
    serveWrite('put', `${IMAGES_PATH}/order`, () => fail(422, 'PRODUCT_IMAGE_ORDER_INVALID'));
    const view = renderPage();
    await openMenu(view, 1, 2);
    await view.user.click(screen.getByRole('menuitem', { name: 'Move later' }));
    expect(
      await screen.findByText("The images changed. We've refreshed them, please try again."),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('Edit sends only what changed: a cleared description as null, "All variants" as null', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    const bodies = serveWrite('patch', `${IMAGES_PATH}/${FRONT.id}`, () => ok({ ...FRONT, altText: null }));
    const view = renderPage();
    await openMenu(view, 1, 2);
    await view.user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit image' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    await view.user.clear(within(dialog).getByRole('textbox', { name: 'Image description' }));
    await view.user.click(save);
    await waitFor(() => {
      expect(bodies).toEqual([{ altText: null }]);
    });
    expect(await screen.findByText('Image saved.')).toBeDefined();
  });

  it('Edit: the variant the image is shown for', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    const bodies = serveWrite('patch', `${IMAGES_PATH}/${BACK.id}`, () => ok({ ...BACK, variantId: null }));
    const view = renderPage();
    await openMenu(view, 2, 2);
    await view.user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit image' });
    await view.user.click(within(dialog).getByRole('combobox', { name: 'Show for variant' }));
    await view.user.click(await screen.findByRole('option', { name: 'All variants' }));
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(bodies).toEqual([{ variantId: null }]);
    });
  });

  it('Remove asks first, then deletes and reads the product again', async () => {
    serveProfile(server);
    const state = serveProduct(PRODUCT);
    const bodies = serveWrite(
      'delete',
      `${IMAGES_PATH}/${BACK.id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const view = renderPage();
    await openMenu(view, 2, 2);
    await view.user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove image' });
    expect(within(dialog).getByText('Remove this image?')).toBeDefined();
    state.product = { ...PRODUCT, images: [FRONT] };
    await view.user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(await screen.findByText('Image removed.')).toBeDefined();
    await waitFor(async () => {
      expect(await tiles()).toHaveLength(1);
    });
  });

  it('an upload is attached as soon as it is ready and joins the images', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    const ids = serveUploads();
    const added: Image = productImageFactory({ position: 2 });
    const bodies = serveWrite('post', IMAGES_PATH, () => ok([FRONT, BACK, added], 201));
    const view = renderPage();
    await view.user.upload(await picker(), new File(['png'], 'side.png', { type: 'image/png' }));
    await waitFor(() => {
      expect(bodies).toEqual([{ mediaId: ids[0] }]);
    });
    await waitFor(async () => {
      expect(await tiles()).toHaveLength(3);
    });
    expect(screen.queryByText('side.png')).toBeNull();
    expect(screen.getByText('Image added.')).toBeDefined();
  });

  it('MEDIA_NOT_ATTACHABLE: the tile asks for the photo again', async () => {
    serveProfile(server);
    serveProduct(PRODUCT);
    serveUploads();
    serveWrite('post', IMAGES_PATH, () => fail(422, 'MEDIA_NOT_ATTACHABLE'));
    const view = renderPage();
    await view.user.upload(await picker(), new File(['png'], 'side.png', { type: 'image/png' }));
    expect(await screen.findByText('Upload this photo again.')).toBeDefined();
  });

  it('PRODUCT_IMAGE_LIMIT_REACHED: reads the product again and gives the limit', async () => {
    serveProfile(server);
    const state = serveProduct(PRODUCT);
    serveUploads();
    serveWrite('post', IMAGES_PATH, () => fail(422, 'PRODUCT_IMAGE_LIMIT_REACHED'));
    const view = renderPage();
    await view.user.upload(await picker(), new File(['png'], 'side.png', { type: 'image/png' }));
    expect(await screen.findByText('A product can have up to 8 images.')).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('with 8 images: the picker is off and says why', async () => {
    serveProfile(server);
    const images = Array.from({ length: 8 }, (_, position) => productImageFactory({ position }));
    serveProduct({ ...PRODUCT, images });
    renderPage();
    await imageList();
    const input = screen.getByLabelText('Add images');
    expect(input.hasAttribute('disabled')).toBe(true);
    const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('A product can have up to 8 images.');
  });

  it('a seller not approved yet sees the images but cannot change them', async () => {
    serveProfile(server, 'pending_approval');
    serveProduct(PRODUCT);
    renderPage();
    await imageList();
    const trigger = screen.getByRole('button', { name: 'Actions for image 1 of 2' });
    await waitFor(() => {
      expect(trigger.hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByLabelText('Add images').hasAttribute('disabled')).toBe(true);
  });

  it('variants table: the variant\'s own image, else "Main image"', async () => {
    serveProfile(server);
    const other = sellerVariantFactory({ sku: 'LS-S', isDefault: false, options: [chosen(SIZE, 0)] });
    serveProduct({ ...PRODUCT, variants: [VARIANT_M, other] });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Variants of this product' });
    const rowOf = (sku: string) => {
      const row = within(table).getByText(sku).closest('tr');
      if (row === null) throw new Error(`row ${sku}`);
      return row;
    };
    expect(within(rowOf('LS-M')).getByRole('img', { name: 'Linen shirt' })).toBeDefined();
    expect(within(rowOf('LS-S')).getByText('Main image')).toBeDefined();
  });
});

describe('blocked product (spec 02 §8.3)', { timeout: 15_000 }, () => {
  const BLOCKED: Product = {
    ...PRODUCT,
    status: 'inactive',
    variants: [VARIANT_M],
    adminBlocked: true,
    adminBlockReason: 'Counterfeit listing',
  };
  const BANNER =
    "Nile blocked this product: Counterfeit listing. It's hidden from the store and its status can't be changed. Contact support if you think this is a mistake.";

  it('banner with "Contact support", badge, and Publish locked with the reason', async () => {
    serveProfile(server);
    serveProduct(BLOCKED);
    renderPage();
    expect(await screen.findByText(BANNER)).toBeDefined();
    expect(screen.getByText('Blocked by Nile')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe(
      `/support/new?category=account&product=${BLOCKED.id}`,
    );
    const publish = screen.getByRole('button', { name: 'Publish' });
    await waitFor(() => {
      expect(publish.hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByText("The status can't be changed while Nile blocks this product.")).toBeDefined();
  });

  it('PRODUCT_BLOCKED from a write: reads the product again and shows the banner text', async () => {
    serveProfile(server);
    const state = serveProduct({ ...PRODUCT, variants: [VARIANT_M], status: 'inactive' });
    serveWrite('post', `/seller/products/${PRODUCT.id}/activate`, () => {
      state.product = BLOCKED;
      return fail(409, 'PRODUCT_BLOCKED');
    });
    const view = renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => {
      expect(publish.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(publish);
    // The toast and the banner both carry the sentence.
    await waitFor(() => {
      expect(screen.getAllByText(BANNER).length).toBeGreaterThanOrEqual(2);
    });
  });
});

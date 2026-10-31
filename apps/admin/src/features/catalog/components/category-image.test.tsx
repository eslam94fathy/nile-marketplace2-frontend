// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import type * as Media from '@nile/media';
import { fixtureId, imageFactory, mediaFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CategoryImage } from './category-image';

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

type Node = Schema<'AdminCategoryNodeDto'>;

const NODE: Node = {
  id: fixtureId(3101),
  parentId: null,
  name: 'Fashion',
  slug: 'fashion',
  depth: 1,
  sortOrder: 1,
  isActive: true,
  image: null,
  attributes: [],
  children: [],
};
const WITH_IMAGE: Node = { ...NODE, image: { ...imageFactory(), altText: 'Folded shirts' } };

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
        const media = mediaFactory({ purpose: 'category_image' });
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

/** `PUT …/image` bodies, answered by `answer`; the tree read after each write answers with the image. */
function serveSetImage(answer: 'ok' | 'not-attachable' = 'ok') {
  const bodies: unknown[] = [];
  server.use(
    mockApi(
      'put',
      '/admin/categories/{categoryId}/image',
      async ({ request, reply }) => {
        bodies.push(await request.json());
        return answer === 'ok' ? reply.ok(WITH_IMAGE) : reply.error(422, 'MEDIA_NOT_ATTACHABLE');
      },
      { base: BFF_BASE },
    ),
    mockApi('get', '/admin/categories', ({ reply }) => reply.ok([WITH_IMAGE]), { base: BFF_BASE }),
  );
  return { bodies };
}

const renderImage = (node: Node) =>
  renderWithProviders(
    <>
      <CategoryImage node={node} />
      <Toaster />
    </>,
  );

describe('category image (spec 03 §7.3 AD-07, T-M4)', { timeout: 15_000 }, () => {
  it('no image: the brand placeholder named by the category, "Upload image"', () => {
    renderImage(NODE);
    const section = screen.getByRole('region', { name: 'Image' });
    expect(within(section).getByText('No image yet.')).toBeDefined();
    expect(within(section).getByRole('img', { name: 'Fashion' })).toBeDefined();
    expect(within(section).getByLabelText('Upload image')).toBeDefined();
    expect(within(section).queryByRole('button', { name: 'Remove image' })).toBeNull();
  });

  it('an upload is set as soon as it is ready; the tile goes once it is saved', async () => {
    const ids = serveUploads();
    const { bodies } = serveSetImage();
    const view = renderImage(NODE);
    await view.user.upload(
      screen.getByLabelText('Upload image'),
      new File(['png'], 'fashion.png', { type: 'image/png' }),
    );
    await waitFor(() => {
      expect(bodies).toEqual([{ mediaId: ids[0] }]);
    });
    // The toast and the polite announcement.
    expect(await screen.findAllByText('Image saved.')).toHaveLength(2);
    expect(screen.queryByText('fashion.png')).toBeNull();
  });

  it('MEDIA_NOT_ATTACHABLE: the tile asks for the photo again, nothing else changes', async () => {
    serveUploads();
    const { bodies } = serveSetImage('not-attachable');
    const view = renderImage(NODE);
    await view.user.upload(
      screen.getByLabelText('Upload image'),
      new File(['png'], 'fashion.png', { type: 'image/png' }),
    );
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(await screen.findByText('Upload this photo again.')).toBeDefined();
    // Toasts outlive a test in this file: check the section's own announcement.
    expect(within(screen.getByRole('region', { name: 'Image' })).queryByText('Image saved.')).toBeNull();
  });

  it('edit the description: the same PUT with the current media id', async () => {
    const { bodies } = serveSetImage();
    const view = renderImage(WITH_IMAGE);
    expect(screen.getByRole('img', { name: 'Folded shirts' })).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Edit description' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit description' });
    const field = within(dialog).getByRole('textbox', { name: /^Image description/ });
    await view.user.clear(field);
    await view.user.type(field, '  Shirts on a shelf ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Description saved.')).toBeDefined();
    expect(bodies).toEqual([{ mediaId: WITH_IMAGE.image?.id, altText: 'Shirts on a shelf' }]);
  });

  it('remove after confirming', async () => {
    let removed = 0;
    server.use(
      mockApi(
        'delete',
        '/admin/categories/{categoryId}/image',
        ({ reply }) => {
          removed += 1;
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
      mockApi('get', '/admin/categories', ({ reply }) => reply.ok([NODE]), { base: BFF_BASE }),
    );
    const view = renderImage(WITH_IMAGE);
    await view.user.click(screen.getByRole('button', { name: 'Remove image' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove image' });
    expect(within(dialog).getByText(/The store shows the Nile placeholder instead\./)).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Remove image' }));
    expect(await screen.findByText('Image removed.')).toBeDefined();
    expect(removed).toBe(1);
  });
});

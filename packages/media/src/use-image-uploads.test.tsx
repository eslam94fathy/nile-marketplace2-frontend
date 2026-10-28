// @vitest-environment jsdom
import { createApiClient, serverTransport } from '@nile/api';
import { imageFactory, mediaFactory, mockApi, TEST_API_ORIGIN } from '@nile/test-utils';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANNOUNCE_COPY, FAILURE_COPY, REFUSAL_COPY } from './copy';
import { useImageUploads, type UseImageUploadsOptions } from './use-image-uploads';

const STORAGE_URL = 'http://storage.test/nile-media';
const CORS = { 'Access-Control-Allow-Origin': '*' };
const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));
const server = setupServer(
  http.options(
    STORAGE_URL,
    () =>
      new HttpResponse(null, {
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
      }),
  ),
);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  // Unmounting cancels the uploads still in flight, so they can't reach the next test's handlers.
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const png = (name: string) => new File(['png-bytes'], name, { type: 'image/png' });

/** Each upload gets its own media id, ready at once. */
function backendReady() {
  let count = 0;
  const ids: string[] = [];
  server.use(
    mockApi('post', '/media/uploads', ({ reply }) => {
      const media = mediaFactory();
      ids.push(media.id);
      count += 1;
      return reply.created({
        media,
        upload: { url: STORAGE_URL, fields: { key: `k${String(count)}` }, expiresAt: '2999-01-01T00:00:00Z' },
      });
    }),
    http.post(STORAGE_URL, () => new HttpResponse(null, { status: 204, headers: CORS })),
    mockApi('post', '/media/uploads/{mediaId}/complete', ({ params, reply }) =>
      reply.ok(mediaFactory({ id: String(params.mediaId), status: 'ready', image: imageFactory() })),
    ),
  );
  return ids;
}

function setup(options: Partial<UseImageUploadsOptions> = {}) {
  const previews = { create: vi.fn((file: Blob) => `blob:${(file as File).name}`), revoke: vi.fn() };
  const decode = vi.fn(() => Promise.resolve({ width: 800, height: 600 }));
  const hook = renderHook(() =>
    useImageUploads({ api, purpose: 'review_image', max: 4, decode, previews, ...options }),
  );
  return { ...hook, previews, decode };
}

describe('useImageUploads (conventions §12.2)', () => {
  it('uploads each picked file at once and reports it ready', async () => {
    const ids = backendReady();
    const { result } = setup();
    act(() => {
      result.current.add([png('a.png'), png('b.png')]);
    });
    expect(result.current.tiles.map((tile) => tile.previewUrl)).toEqual(['blob:a.png', 'blob:b.png']);
    expect(result.current.busy).toBe(true);
    await waitFor(() => {
      expect(result.current.tiles.every((tile) => tile.status === 'ready')).toBe(true);
    });
    expect(result.current.busy).toBe(false);
    expect([...result.current.readyMediaIds].sort()).toEqual([...ids].sort());
    expect([ANNOUNCE_COPY.ready(1, 2), ANNOUNCE_COPY.ready(2, 2)]).toContain(result.current.announcement);
  });

  it('refuses a wrong type before any request (no handler is registered)', async () => {
    const { result } = setup();
    act(() => {
      result.current.add([new File(['gif'], 'anim.gif', { type: 'image/gif' })]);
    });
    await waitFor(() => {
      expect(result.current.refusals).toEqual([
        expect.objectContaining({ fileName: 'anim.gif', reason: 'type', message: REFUSAL_COPY.type(4) }),
      ]);
    });
    expect(result.current.tiles).toEqual([]);
  });

  it('refuses a too-small image and frees its preview', async () => {
    const { result, previews } = setup({ decode: () => Promise.resolve({ width: 120, height: 120 }) });
    act(() => {
      result.current.add([png('tiny.png')]);
    });
    await waitFor(() => {
      expect(result.current.refusals.map((refusal) => refusal.reason)).toEqual(['dimensions']);
    });
    expect(result.current.tiles).toEqual([]);
    expect(previews.revoke).toHaveBeenCalledWith('blob:tiny.png');
  });

  it('refuses files past the screen limit', () => {
    backendReady();
    const { result } = setup({ max: 2 });
    act(() => {
      result.current.add([png('1.png'), png('2.png'), png('3.png')]);
    });
    expect(result.current.tiles).toHaveLength(2);
    expect(result.current.canAddMore).toBe(false);
    expect(result.current.refusals).toEqual([
      expect.objectContaining({ fileName: '3.png', reason: 'count', message: REFUSAL_COPY.count(2) }),
    ]);
  });

  it('shows the failure on the tile and uploads again on retry', async () => {
    let attempt = 0;
    const ids = backendReady();
    server.use(
      mockApi('post', '/media/uploads', ({ reply }) => {
        attempt += 1;
        if (attempt === 1) return reply.error(422, 'MEDIA_OPEN_UPLOAD_LIMIT_REACHED');
        const media = mediaFactory();
        ids.push(media.id);
        return reply.created({
          media,
          upload: { url: STORAGE_URL, fields: {}, expiresAt: '2999-01-01T00:00:00Z' },
        });
      }),
    );
    const { result } = setup();
    act(() => {
      result.current.add([png('a.png')]);
    });
    await waitFor(() => {
      expect(result.current.tiles[0]).toMatchObject({
        status: 'failed',
        message: FAILURE_COPY.open_limit,
        canRetry: true,
      });
    });
    expect(result.current.announcement).toBe(ANNOUNCE_COPY.failed(1, 1, FAILURE_COPY.open_limit));
    const key = result.current.tiles[0]?.key ?? '';
    act(() => {
      result.current.retry(key);
    });
    await waitFor(() => {
      expect(result.current.tiles[0]?.status).toBe('ready');
    });
    expect(result.current.readyMediaIds).toEqual(ids);
  });

  it('does not offer a retry for an invalid image', async () => {
    backendReady();
    server.use(
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) =>
        reply.error(422, 'MEDIA_UPLOAD_INVALID'),
      ),
    );
    const { result } = setup();
    act(() => {
      result.current.add([png('fake.png')]);
    });
    await waitFor(() => {
      expect(result.current.tiles[0]).toMatchObject({
        status: 'failed',
        message: FAILURE_COPY.invalid,
        canRetry: false,
      });
    });
  });

  it('tells the screen how long to wait after RATE_LIMITED', async () => {
    server.use(
      http.post(`${TEST_API_ORIGIN}/api/v1/media/uploads`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'slow down' }, correlationId: 'c' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );
    const onRateLimited = vi.fn();
    const { result } = setup({ onRateLimited });
    act(() => {
      result.current.add([png('a.png')]);
    });
    await waitFor(() => {
      expect(onRateLimited).toHaveBeenCalledWith(30);
    });
  });

  it('removes a tile, frees its preview and drops its media id', async () => {
    backendReady();
    const { result, previews } = setup();
    act(() => {
      result.current.add([png('a.png')]);
    });
    await waitFor(() => {
      expect(result.current.readyMediaIds).toHaveLength(1);
    });
    act(() => {
      result.current.remove(result.current.tiles[0]?.key ?? '');
    });
    expect(result.current.tiles).toEqual([]);
    expect(result.current.readyMediaIds).toEqual([]);
    expect(previews.revoke).toHaveBeenCalledWith('blob:a.png');
  });

  it('marks the tiles named by MEDIA_NOT_ATTACHABLE for a new upload', async () => {
    const ids = backendReady();
    const { result } = setup();
    act(() => {
      result.current.add([png('a.png'), png('b.png')]);
    });
    await waitFor(() => {
      expect(result.current.readyMediaIds).toHaveLength(2);
    });
    act(() => {
      result.current.markNotAttachable([ids[0] ?? '']);
    });
    const tile = result.current.tiles.find((item) => item.mediaId === ids[0]);
    expect(tile).toMatchObject({ status: 'failed', message: FAILURE_COPY.not_attachable, canRetry: true });
    expect(result.current.readyMediaIds).toEqual([ids[1]]);
  });

  it('frees every preview when the screen goes away', async () => {
    backendReady();
    const { result, previews, unmount } = setup();
    act(() => {
      result.current.add([png('a.png')]);
    });
    await waitFor(() => {
      expect(result.current.readyMediaIds).toHaveLength(1);
    });
    unmount();
    expect(previews.revoke).toHaveBeenCalledWith('blob:a.png');
  });
});

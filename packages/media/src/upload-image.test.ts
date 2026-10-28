// @vitest-environment jsdom
import { createApiClient, type ErrorCode, serverTransport } from '@nile/api';
import { imageFactory, mediaFactory, mockApi, TEST_API_ORIGIN } from '@nile/test-utils';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { COMPLETE_MISSING_RETRIES } from './limits';
import { UploadFailure, uploadImage } from './upload-image';

const STORAGE_URL = 'http://storage.test/nile-media';
const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));
// Storage is another origin: browsers (and jsdom) preflight an upload with progress listeners, so the bucket's
// CORS rule must allow the web origins (CLAUDE.md §14.3 OQ-17).
const CORS = { 'Access-Control-Allow-Origin': '*' };
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
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
});

const pending = mediaFactory();
const ready = { ...pending, status: 'ready' as const, image: imageFactory() };
const file = () => new File(['png-bytes'], 'shirt.png', { type: 'image/png' });

/** Answers each request with the next reply; the last one repeats. */
function sequence<T>(replies: readonly T[]) {
  let call = 0;
  return () => replies[Math.min(call++, replies.length - 1)] as T;
}

function ticket(expiresAt = '2999-01-01T00:00:00.000Z') {
  return mockApi('post', '/media/uploads', ({ reply }) =>
    reply.created({
      media: pending,
      upload: {
        url: STORAGE_URL,
        fields: { key: `uploads/${pending.id}`, 'Content-Type': 'image/png' },
        expiresAt,
      },
    }),
  );
}

const storageOk = () => http.post(STORAGE_URL, () => new HttpResponse(null, { status: 204, headers: CORS }));

const run = (now?: () => number) =>
  uploadImage({
    api,
    purpose: 'review_image',
    file: file(),
    contentType: 'image/png',
    ...(now ? { now } : {}),
  });

/** Drives fake timers until the promise settles (polling and retry delays). */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const state = { done: false };
  promise.then(
    () => (state.done = true),
    () => (state.done = true),
  );
  if (!vi.isFakeTimers()) return promise;
  for (let tick = 0; tick < 200 && !state.done; tick += 1) await vi.advanceTimersByTimeAsync(1_000);
  return promise;
}

async function failureOf(promise: Promise<unknown>) {
  const error: unknown = await settle(promise).catch((e: unknown) => e);
  if (!(error instanceof UploadFailure)) throw new Error(`expected UploadFailure, got ${String(error)}`);
  return error;
}

describe('uploadImage (design 01 §15.4)', () => {
  it('requests the upload with the file facts, posts the file to storage and completes', async () => {
    const bodies: unknown[] = [];
    let storageFields: string[] = [];
    server.use(
      mockApi('post', '/media/uploads', async ({ request, reply }) => {
        bodies.push(await request.json());
        return reply.created({
          media: pending,
          upload: {
            url: STORAGE_URL,
            fields: { key: 'k', 'Content-Type': 'image/png' },
            expiresAt: '2999-01-01T00:00:00Z',
          },
        });
      }),
      http.post(STORAGE_URL, async ({ request }) => {
        // Field names in body order (jsdom's File can't go through undici's formData parser).
        storageFields = [...(await request.text()).matchAll(/form-data; name="([^"]+)"/g)].map(
          ([, name]) => name ?? '',
        );
        return new HttpResponse(null, { status: 204, headers: CORS });
      }),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => reply.ok(ready)),
    );
    const result = await run();
    expect(bodies).toEqual([{ purpose: 'review_image', contentType: 'image/png', sizeBytes: file().size }]);
    expect(storageFields).toEqual(['key', 'Content-Type', 'file']);
    expect(result).toEqual({ mediaId: pending.id, image: ready.image });
  });

  it('waits for processing by polling the media until it is ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const processing = { ...pending, status: 'processing' as const };
    const next = sequence([processing, processing, ready]);
    const polls = vi.fn();
    server.use(
      ticket(),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => reply.ok(processing)),
      mockApi('get', '/media/{mediaId}', ({ reply }) => {
        polls();
        return reply.ok(next());
      }),
    );
    await expect(settle(run())).resolves.toEqual({ mediaId: pending.id, image: ready.image });
    expect(polls).toHaveBeenCalledTimes(3);
  });

  it('retries complete while the object has not reached storage, then gives up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const completes = vi.fn();
    server.use(
      ticket(),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => {
        completes();
        return reply.error(409, 'MEDIA_UPLOAD_MISSING');
      }),
    );
    expect((await failureOf(run())).kind).toBe('interrupted');
    expect(completes).toHaveBeenCalledTimes(COMPLETE_MISSING_RETRIES + 1);
  });

  it('stops retrying complete once the upload URL has expired', async () => {
    const completes = vi.fn();
    server.use(
      ticket('2026-10-28T10:00:00.000Z'),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => {
        completes();
        return reply.error(409, 'MEDIA_UPLOAD_MISSING');
      }),
    );
    const failure = await failureOf(run(() => Date.parse('2026-10-28T10:00:01.000Z')));
    expect(failure.kind).toBe('interrupted');
    expect(completes).toHaveBeenCalledTimes(1);
  });

  it.each<[number, ErrorCode, string]>([
    [422, 'MEDIA_OPEN_UPLOAD_LIMIT_REACHED', 'open_limit'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [403, 'MEDIA_PURPOSE_NOT_ALLOWED', 'unexpected'],
    [503, 'SERVICE_UNAVAILABLE', 'interrupted'],
  ])('maps %i %s on the upload request to %s', async (status, code, kind) => {
    server.use(mockApi('post', '/media/uploads', ({ reply }) => reply.error(status, code)));
    expect((await failureOf(run())).kind).toBe(kind);
  });

  it('passes the Retry-After seconds of RATE_LIMITED on', async () => {
    server.use(
      http.post(`${TEST_API_ORIGIN}/api/v1/media/uploads`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'slow down' }, correlationId: 'c' },
          { status: 429, headers: { 'Retry-After': '17' } },
        ),
      ),
    );
    expect((await failureOf(run())).retryAfterSeconds).toBe(17);
  });

  it.each<[number, ErrorCode, string]>([
    [422, 'MEDIA_UPLOAD_INVALID', 'invalid'],
    [409, 'MEDIA_INVALID_STATUS', 'invalid'],
    [404, 'MEDIA_NOT_FOUND', 'unexpected'],
  ])('maps %i %s on complete to %s', async (status, code, kind) => {
    server.use(
      ticket(),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => reply.error(status, code)),
    );
    expect((await failureOf(run())).kind).toBe(kind);
  });

  it('treats a storage refusal as an interrupted upload, without completing', async () => {
    const completes = vi.fn();
    server.use(
      ticket(),
      http.post(
        STORAGE_URL,
        () => new HttpResponse('<Error><Code>AccessDenied</Code></Error>', { status: 403, headers: CORS }),
      ),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => {
        completes();
        return reply.ok(ready);
      }),
    );
    expect((await failureOf(run())).kind).toBe('interrupted');
    expect(completes).not.toHaveBeenCalled();
  });

  it.each([
    ['decode_failed', 'decode'],
    ['unsupported_type', 'invalid'],
    ['dimensions_out_of_range', 'dimensions'],
  ] as const)('maps processing failure %s to %s', async (failureReason, kind) => {
    server.use(
      ticket(),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) =>
        reply.ok({ ...pending, status: 'failed', failureReason }),
      ),
    );
    expect((await failureOf(run())).kind).toBe(kind);
  });

  it('keeps polling through a transient failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const processing = { ...pending, status: 'processing' as const };
    let polls = 0;
    server.use(
      ticket(),
      storageOk(),
      mockApi('post', '/media/uploads/{mediaId}/complete', ({ reply }) => reply.ok(processing)),
      mockApi('get', '/media/{mediaId}', ({ reply }) => {
        polls += 1;
        return polls === 1 ? reply.error(503, 'SERVICE_UNAVAILABLE') : reply.ok(ready);
      }),
    );
    await expect(settle(run())).resolves.toMatchObject({ mediaId: pending.id });
    expect(polls).toBe(2);
  });

  it('rejects with an AbortError when cancelled', async () => {
    const controller = new AbortController();
    server.use(
      mockApi('post', '/media/uploads', ({ reply }) => {
        controller.abort();
        return reply.created({
          media: pending,
          upload: { url: STORAGE_URL, fields: {}, expiresAt: '2999-01-01T00:00:00Z' },
        });
      }),
    );
    const done = uploadImage({
      api,
      purpose: 'review_image',
      file: file(),
      contentType: 'image/png',
      signal: controller.signal,
    });
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
  });
});

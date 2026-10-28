import { type ApiClient, type components, isApiError, storageUpload, unwrap } from '@nile/api';
import { COMPLETE_MISSING_RETRIES, COMPLETE_RETRY_DELAY_MS, type MediaContentType } from './limits';
import { type MediaDto, waitForMedia, type WaitForMediaOptions } from './wait-for-media';

export type MediaPurpose = components['schemas']['CreateUploadDto']['purpose'];
export type ImageDto = components['schemas']['ImageDto'];

/** Why an upload failed, each with its own copy (conventions §12.2). */
export type UploadFailureKind =
  | 'open_limit' // MEDIA_OPEN_UPLOAD_LIMIT_REACHED
  | 'invalid' // MEDIA_UPLOAD_INVALID, failed `unsupported_type`
  | 'decode' // failed `decode_failed`
  | 'dimensions' // failed `dimensions_out_of_range`
  | 'interrupted' // network, storage refused, MEDIA_UPLOAD_MISSING after the URL expired
  | 'rate_limited' // RATE_LIMITED
  | 'not_attachable' // MEDIA_NOT_ATTACHABLE on the owner's submit
  | 'unexpected';

export class UploadFailure extends Error {
  override readonly name = 'UploadFailure';
  readonly kind: UploadFailureKind;
  /** Seconds from `Retry-After` when `rate_limited`. */
  readonly retryAfterSeconds: number | null;

  constructor(kind: UploadFailureKind, options?: { cause?: unknown; retryAfterSeconds?: number | null }) {
    super(`upload failed: ${kind}`, options);
    this.kind = kind;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}

/** A failure the user can retry from the tile (a new upload from the start). */
export const RETRYABLE_FAILURES: ReadonlySet<UploadFailureKind> = new Set([
  'open_limit',
  'interrupted',
  'rate_limited',
  'not_attachable',
  'unexpected',
]);

const FAILURE_REASONS: Readonly<Record<NonNullable<MediaDto['failureReason']>, UploadFailureKind>> = {
  unsupported_type: 'invalid',
  decode_failed: 'decode',
  dimensions_out_of_range: 'dimensions',
};

// By name: the DOMException of a cancelled fetch may come from another realm than the global one.
const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

function classify(error: unknown): UploadFailure {
  if (error instanceof UploadFailure) return error;
  if (isApiError(error, 'MEDIA_OPEN_UPLOAD_LIMIT_REACHED'))
    return new UploadFailure('open_limit', { cause: error });
  if (isApiError(error, 'MEDIA_UPLOAD_INVALID', 'MEDIA_INVALID_STATUS')) {
    return new UploadFailure('invalid', { cause: error });
  }
  if (isApiError(error, 'RATE_LIMITED')) {
    return new UploadFailure('rate_limited', { cause: error, retryAfterSeconds: error.retryAfterSeconds });
  }
  if (
    isApiError(error) &&
    (error.status === 0 || error.status >= 500 || error.code === 'MEDIA_UPLOAD_MISSING')
  ) {
    return new UploadFailure('interrupted', { cause: error });
  }
  if (isApiError(error, 'STORAGE_UPLOAD_REJECTED')) return new UploadFailure('interrupted', { cause: error });
  return new UploadFailure('unexpected', { cause: error });
}

const delay = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The upload was cancelled.', 'AbortError'));
      },
      { once: true },
    );
  });

export interface UploadImageInput extends Pick<WaitForMediaOptions, 'subscribe'> {
  readonly api: ApiClient;
  readonly purpose: MediaPurpose;
  readonly file: File;
  /** From `checkImageFile`. */
  readonly contentType: MediaContentType;
  readonly signal?: AbortSignal;
  readonly onProgress?: (percent: number) => void;
  /** The file reached storage; the backend is processing it. */
  readonly onProcessing?: (mediaId: string) => void;
  /** Tests only: fixed clock. */
  readonly now?: () => number;
}

export interface UploadedImage {
  readonly mediaId: string;
  readonly image: ImageDto;
}

/**
 * One image from file to `ready` (design 01 §15.4): request an upload → post the file to storage → complete
 * (`MEDIA_UPLOAD_MISSING` retried 3 × 1 s while the upload URL is valid) → wait for processing. Never retried
 * after a definite answer; rejects with `UploadFailure`, or an `AbortError` when cancelled.
 */
export async function uploadImage({
  api,
  purpose,
  file,
  contentType,
  signal,
  onProgress,
  onProcessing,
  subscribe,
  now = Date.now,
}: UploadImageInput): Promise<UploadedImage> {
  const withSignal = signal === undefined ? {} : { signal };
  try {
    const { data: ticket } = await unwrap(
      api.POST('/api/v1/media/uploads', {
        body: { purpose, contentType, sizeBytes: file.size },
        ...withSignal,
      }),
    );
    const mediaId = ticket.media.id;
    await storageUpload({
      url: ticket.upload.url,
      fields: ticket.upload.fields,
      file,
      ...withSignal,
      ...(onProgress === undefined ? {} : { onProgress }),
    });
    onProcessing?.(mediaId);

    const expiresAt = Date.parse(ticket.upload.expiresAt);
    let media: MediaDto | undefined;
    for (let attempt = 0; media === undefined; attempt += 1) {
      try {
        media = (
          await unwrap(
            api.POST('/api/v1/media/uploads/{mediaId}/complete', {
              params: { path: { mediaId } },
              ...withSignal,
            }),
          )
        ).data;
      } catch (error) {
        const retry =
          isApiError(error, 'MEDIA_UPLOAD_MISSING') &&
          attempt < COMPLETE_MISSING_RETRIES &&
          now() < expiresAt;
        if (!retry) throw error;
        await delay(COMPLETE_RETRY_DELAY_MS, signal);
      }
    }

    if (media.status !== 'ready' && media.status !== 'failed') {
      media = await waitForMedia(api, mediaId, {
        ...withSignal,
        ...(subscribe === undefined ? {} : { subscribe }),
      });
    }
    if (media.status === 'failed') {
      throw new UploadFailure(
        media.failureReason === null ? 'invalid' : FAILURE_REASONS[media.failureReason],
      );
    }
    if (media.image === null) throw new UploadFailure('unexpected');
    return { mediaId, image: media.image };
  } catch (error) {
    if (isAbort(error)) throw error;
    throw classify(error);
  }
}

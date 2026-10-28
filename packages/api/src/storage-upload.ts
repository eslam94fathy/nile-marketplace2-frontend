import { ApiError, networkError } from './errors';

// Browser → object storage, the only code that posts to storage (design 01 §15.1, R-54). The presigned POST form
// from `POST /media/uploads` goes straight to S3 / MinIO: no BFF, no token, no cookies. `XMLHttpRequest` because
// `fetch` reports no upload progress.

export interface StorageUploadInput {
  /** `UploadFormDto.url`. */
  readonly url: string;
  /** `UploadFormDto.fields`, sent as they are, before the file. */
  readonly fields: Readonly<Record<string, string>>;
  readonly file: Blob;
  /** 0…100, as the browser reports bytes sent. */
  readonly onProgress?: (percent: number) => void;
  readonly signal?: AbortSignal;
}

const abortError = () => new DOMException('The upload was cancelled.', 'AbortError');

/**
 * Resolves once storage accepted the file (2xx). Rejects with an `AbortError` when cancelled, `NETWORK_ERROR`
 * when no answer arrived, and `STORAGE_UPLOAD_REJECTED` (with the HTTP status) when storage refused the form (expired, too large,
 * wrong type).
 */
export function storageUpload({ url, fields, file, onProgress, signal }: StorageUploadInput): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError());
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    // S3 ignores every field after the file, so it goes last.
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      xhr.abort();
    };
    const settle = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', url);
    xhr.withCredentials = false;
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    xhr.addEventListener('load', () => {
      settle();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new ApiError(xhr.status, 'STORAGE_UPLOAD_REJECTED', 'Storage refused the upload.'));
    });
    xhr.addEventListener('error', () => {
      settle();
      reject(networkError(new Error('storage upload failed')));
    });
    xhr.addEventListener('abort', () => {
      settle();
      reject(abortError());
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(form);
  });
}

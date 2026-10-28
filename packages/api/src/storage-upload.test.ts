import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from './errors';
import { storageUpload } from './storage-upload';

type Listener = (event: { lengthComputable: boolean; loaded: number; total: number }) => void;

/** Just enough of XMLHttpRequest to drive each outcome by hand. */
class FakeXhr {
  static last: FakeXhr | undefined;
  method = '';
  url = '';
  withCredentials = true;
  status = 0;
  body: FormData | undefined;
  aborted = false;
  private readonly listeners = new Map<string, (() => void)[]>();
  readonly upload = {
    progress: [] as Listener[],
    addEventListener: (_type: 'progress', listener: Listener) => {
      this.upload.progress.push(listener);
    },
  };

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.emit('abort');
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  respond(status: number) {
    this.status = status;
    this.emit('load');
  }
}

const sent = () => {
  const xhr = FakeXhr.last;
  if (xhr === undefined) throw new Error('nothing sent');
  return xhr;
};

const start = (signal?: AbortSignal, onProgress?: (percent: number) => void) => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return storageUpload({
    url: 'http://storage.test/nile-media',
    fields: { key: 'uploads/m-1', 'Content-Type': 'image/png', Policy: 'p' },
    file: new Blob(['png'], { type: 'image/png' }),
    ...(signal === undefined ? {} : { signal }),
    ...(onProgress === undefined ? {} : { onProgress }),
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.last = undefined;
});

describe('storageUpload (design 01 §15.1)', () => {
  it('posts the presigned fields, then the file last, without credentials', async () => {
    const done = start();
    const xhr = sent();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://storage.test/nile-media');
    expect(xhr.withCredentials).toBe(false);
    expect([...(xhr.body?.keys() ?? [])]).toEqual(['key', 'Content-Type', 'Policy', 'file']);
    xhr.respond(204);
    await expect(done).resolves.toBeUndefined();
  });

  it('reports progress as whole percents and 100 at the end', async () => {
    const progress: number[] = [];
    const done = start(undefined, (percent) => progress.push(percent));
    const xhr = sent();
    for (const listener of xhr.upload.progress) listener({ lengthComputable: true, loaded: 1, total: 3 });
    xhr.respond(201);
    await done;
    expect(progress).toEqual([33, 100]);
  });

  it('rejects with STORAGE_UPLOAD_REJECTED and the status when storage refuses the form', async () => {
    const done = start();
    sent().respond(403);
    const error: unknown = await done.catch((e: unknown) => e);
    expect(isApiError(error, 'STORAGE_UPLOAD_REJECTED')).toBe(true);
    expect(isApiError(error) && error.status).toBe(403);
  });

  it('rejects with NETWORK_ERROR when no answer arrives', async () => {
    const done = start();
    sent().emit('error');
    expect(isApiError(await done.catch((e: unknown) => e), 'NETWORK_ERROR')).toBe(true);
  });

  it('aborts the request when cancelled', async () => {
    const controller = new AbortController();
    const done = start(controller.signal);
    controller.abort();
    expect(sent().aborted).toBe(true);
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
  });
});

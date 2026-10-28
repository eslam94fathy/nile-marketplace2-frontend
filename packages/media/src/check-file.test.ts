import { describe, expect, it, vi } from 'vitest';
import { checkImageFile } from './check-file';
import { MEDIA_MAX_UPLOAD_BYTES } from './limits';

const fileOf = (type: string, size = 1_000) => new File([new Uint8Array(size)], 'photo', { type });
const decodesTo = (width: number, height: number) => vi.fn(() => Promise.resolve({ width, height }));

describe('checkImageFile (conventions §12.2)', () => {
  it('accepts a JPEG, PNG or WebP of at least 200 × 200 within 5 MB', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      await expect(checkImageFile(fileOf(type), decodesTo(200, 640))).resolves.toEqual({
        ok: true,
        contentType: type,
        width: 200,
        height: 640,
      });
    }
  });

  it('refuses other types without decoding them', async () => {
    const decode = decodesTo(800, 800);
    for (const type of ['image/gif', 'image/svg+xml', 'image/heic', '']) {
      expect(await checkImageFile(fileOf(type), decode)).toEqual({ ok: false, reason: 'type' });
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('refuses a file over 5 MB without decoding it', async () => {
    const decode = decodesTo(800, 800);
    expect(await checkImageFile(fileOf('image/png', MEDIA_MAX_UPLOAD_BYTES + 1), decode)).toEqual({
      ok: false,
      reason: 'size',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('accepts exactly 5 MB', async () => {
    expect((await checkImageFile(fileOf('image/png', MEDIA_MAX_UPLOAD_BYTES), decodesTo(800, 800))).ok).toBe(
      true,
    );
  });

  it('refuses an image under 200 px on either side', async () => {
    expect(await checkImageFile(fileOf('image/png'), decodesTo(199, 800))).toEqual({
      ok: false,
      reason: 'dimensions',
    });
    expect(await checkImageFile(fileOf('image/png'), decodesTo(800, 199))).toEqual({
      ok: false,
      reason: 'dimensions',
    });
  });

  it('refuses a file the browser cannot decode, and an empty one', async () => {
    const broken = vi.fn(() => Promise.reject(new Error('decode')));
    expect(await checkImageFile(fileOf('image/png'), broken)).toEqual({ ok: false, reason: 'unreadable' });
    expect(await checkImageFile(fileOf('image/png', 0), decodesTo(800, 800))).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });
});

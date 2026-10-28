import {
  MEDIA_CONTENT_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_MIN_DIMENSION_PX,
  type MediaContentType,
} from './limits';

/** Why a file is refused before upload (conventions §12.2). */
export type FileRefusal = 'type' | 'size' | 'dimensions' | 'unreadable';

export type FileCheck =
  | {
      readonly ok: true;
      readonly contentType: MediaContentType;
      readonly width: number;
      readonly height: number;
    }
  | { readonly ok: false; readonly reason: FileRefusal };

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Reads the decoded size of an image file; rejects when the browser can't decode it. */
export type DecodeImage = (file: Blob) => Promise<Dimensions>;

export const decodeImage: DecodeImage = async (file) => {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
};

const isContentType = (type: string): type is MediaContentType =>
  (MEDIA_CONTENT_TYPES as readonly string[]).includes(type);

/** Type, size and decoded dimensions, cheapest first. */
export async function checkImageFile(file: File, decode: DecodeImage = decodeImage): Promise<FileCheck> {
  if (!isContentType(file.type)) return { ok: false, reason: 'type' };
  if (file.size > MEDIA_MAX_UPLOAD_BYTES) return { ok: false, reason: 'size' };
  if (file.size === 0) return { ok: false, reason: 'unreadable' };
  let size: Dimensions;
  try {
    size = await decode(file);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (size.width < MEDIA_MIN_DIMENSION_PX || size.height < MEDIA_MIN_DIMENSION_PX) {
    return { ok: false, reason: 'dimensions' };
  }
  return { ok: true, contentType: file.type, width: size.width, height: size.height };
}

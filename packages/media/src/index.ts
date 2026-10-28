// Public interface of @nile/media (design 01 §15.1, §15.4): React, no Next.js. Uploads go browser → storage
// through `storageUpload` in @nile/api; the owning feature attaches the ready media ids in its own mutation.
export {
  checkImageFile,
  decodeImage,
  type DecodeImage,
  type Dimensions,
  type FileCheck,
  type FileRefusal,
} from './check-file';
export { ANNOUNCE_COPY, FAILURE_COPY, REFUSAL_COPY } from './copy';
export {
  COMPLETE_MISSING_RETRIES,
  COMPLETE_RETRY_DELAY_MS,
  MEDIA_ACCEPT,
  MEDIA_CONTENT_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_MIN_DIMENSION_PX,
  MEDIA_POLL_FIRST_DELAY_MS,
  MEDIA_POLL_MAX_DELAY_MS,
  type MediaContentType,
} from './limits';
export {
  RETRYABLE_FAILURES,
  UploadFailure,
  uploadImage,
  type ImageDto,
  type MediaPurpose,
  type UploadedImage,
  type UploadFailureKind,
  type UploadImageInput,
} from './upload-image';
export {
  useImageUploads,
  type FileRefusalNotice,
  type ImageUploads,
  type PreviewUrls,
  type UploadTile,
  type UploadTileStatus,
  type UseImageUploadsOptions,
} from './use-image-uploads';
export { waitForMedia, type MediaDto, type WaitForMediaOptions } from './wait-for-media';

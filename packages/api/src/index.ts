// Public interface of @nile/api (design 01 §2). Framework-free: no React, no Next.js.
export type { components, paths } from './generated/schema';
export { createApiClient, unwrap, type ApiClient, type Unwrapped } from './client';
export { ApiError, isApiError, parseRetryAfter, type ErrorDetail } from './errors';
export {
  BACKEND_ERROR_CODES,
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  isKnownErrorCode,
  type ErrorCode,
} from './error-codes';
export {
  InvalidQueryError,
  inValues,
  productQuery,
  serializeQuery,
  type ProductListQuery,
  type ProductQueryInput,
} from './query';
export {
  API_PREFIX,
  HEADER,
  browserTransport,
  serverTransport,
  type BrowserTransportOptions,
  type ServerTransportOptions,
  type Transport,
} from './transports';
export {
  BFF_ALLOW_LISTS,
  BFF_APPS,
  BFF_METHODS,
  type AllowedOperation,
  type BffApp,
  type BffMethod,
  type OperationPath,
} from './allow-lists';
export { fetchWithTimeout, forwardToBackend, upstreamTimeout, type ForwardOptions } from './upstream';
export type { Schema } from './types';

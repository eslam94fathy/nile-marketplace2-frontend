import createClient, { type Client } from 'openapi-fetch';
import { ApiError, apiErrorFromResponse, networkError } from './errors';
import type { paths } from './generated/schema';
import { serializeQuery } from './query';
import type { Transport } from './transports';

export type ApiClient = Client<paths>;

/**
 * Typed client over the generated `paths` (path + method keyed, design 01 §6.2). Calls return openapi-fetch
 * results; pass them to `unwrap()` to get `{ data, meta }` or an ApiError.
 */
export function createApiClient(transport: Transport): ApiClient {
  const client = createClient<paths>({
    baseUrl: transport.baseUrl,
    querySerializer: (query) => serializeQuery(query),
    ...(transport.fetch ? { fetch: transport.fetch } : {}),
    ...(transport.credentials ? { credentials: transport.credentials } : {}),
  });
  for (const middleware of transport.middleware) client.use(middleware);
  return client;
}

/** The success envelope `{ success: true, data, meta? }` reduced to `{ data, meta }`. */
export type Unwrapped<T> = [T] extends [never]
  ? { data: undefined; meta: undefined }
  : T extends { data: infer D; meta: infer M }
    ? { data: D; meta: M }
    : T extends { data: infer D }
      ? { data: D; meta: undefined }
      : { data: undefined; meta: undefined };

interface CallResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function isSuccessEnvelope(body: unknown): body is { success: true; data: unknown; meta?: unknown } {
  return typeof body === 'object' && body !== null && (body as { success?: unknown }).success === true;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Awaits an openapi-fetch call and returns `{ data, meta }`; throws ApiError for every failure:
 * error envelopes (by code), non-envelope answers and network failures (`NETWORK_ERROR`). Aborts are rethrown
 * as they are, so query cancellation keeps working.
 */
export async function unwrap<T>(call: Promise<CallResult<T>>): Promise<Unwrapped<T>> {
  let result: CallResult<T>;
  try {
    result = await call;
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    // Already classified by the transport (e.g. UPSTREAM_TIMEOUT from fetchWithTimeout).
    if (cause instanceof ApiError) throw cause;
    throw networkError(cause);
  }
  const { response } = result;
  if (!response.ok) throw apiErrorFromResponse(response, result.error);
  if (response.status === 204) return { data: undefined, meta: undefined } as Unwrapped<T>;
  if (!isSuccessEnvelope(result.data)) {
    throw networkError(new Error('response is not a success envelope'), response.status);
  }
  return { data: result.data.data, meta: result.data.meta } as Unwrapped<T>;
}

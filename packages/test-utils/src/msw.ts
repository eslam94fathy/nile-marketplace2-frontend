import type { ErrorCode } from '@nile/api';
import type { paths } from '@nile/api/schema';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import { errorBody, okBody, type ErrorBodyInit } from './envelope';

// Typed MSW handlers (design 01 §2): the path must exist in the committed OpenAPI snapshot and the
// mocked data must match the generated response type, so a contract change breaks the mocks at compile time.

/** Origin the API client uses in component tests (`serverTransport({ baseUrl: TEST_API_ORIGIN })`). */
export const TEST_API_ORIGIN = 'http://backend.test';
/** Default base of mocked paths: the backend's `/api/v1`. Browser-transport tests pass the BFF base instead. */
export const TEST_API_BASE = `${TEST_API_ORIGIN}/api/v1`;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type ApiPrefix = '/api/v1';
type ApiPath = Extract<keyof paths, `${ApiPrefix}/${string}`>;
type Short<P> = P extends `${ApiPrefix}${infer Rest}` ? Rest : never;

/** Paths (without `/api/v1`) that have an operation for `M`, e.g. `'/orders/{orderId}'` for `'get'`. */
export type MockPath<M extends HttpMethod> = {
  [P in ApiPath]: paths[P][M] extends { responses: unknown } ? Short<P> : never;
}[ApiPath];

type Operation<M extends HttpMethod, S extends MockPath<M>> = paths[`${ApiPrefix}${S}`][M];
type Responses<O> = O extends { responses: infer R } ? R : never;
type JsonBody<R> = R extends { content: { 'application/json': infer B } } ? B : never;
type SuccessBody<O> = JsonBody<Responses<O>[Extract<keyof Responses<O>, 200 | 201>]>;
type SuccessData<O> = SuccessBody<O> extends { data: infer D } ? D : never;
type SuccessMeta<O> = SuccessBody<O> extends { meta?: infer Meta } ? Meta : never;

/** What a mocked handler answers. Build it with the `reply` kit passed to the resolver. */
export interface MockReply {
  readonly status: number;
  readonly body: unknown;
}

export interface ReplyKit<O> {
  /** `200` with the success envelope; `meta` for lists. */
  ok(data: SuccessData<O>, meta?: SuccessMeta<O>): MockReply;
  /** `201` with the success envelope. */
  created(data: SuccessData<O>): MockReply;
  /** `204` without a body. */
  noContent(): MockReply;
  /** An error envelope with this status and code. */
  error(status: number, code: ErrorCode, init?: ErrorBodyInit): MockReply;
}

type ResolverInfo = Parameters<HttpResponseResolver>[0];

export type MockResolver<O> = (
  info: ResolverInfo & { readonly reply: ReplyKit<O> },
) => MockReply | Promise<MockReply>;

export interface MockApiOptions {
  /** Defaults to `TEST_API_BASE`; use the app's BFF base (e.g. `http://app.test/api/bff`) for browser code. */
  readonly base?: string;
}

function replyKit<O>(): ReplyKit<O> {
  return {
    ok: (data, meta) => ({ status: 200, body: okBody(data, meta) }),
    created: (data) => ({ status: 201, body: okBody(data) }),
    noContent: () => ({ status: 204, body: undefined }),
    error: (status, code, init) => ({ status, body: errorBody(code, init) }),
  };
}

/** OpenAPI `{orderId}` → MSW `:orderId`. */
export function toMswPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

/**
 * A typed MSW handler: `mockApi('get', '/orders/{orderId}', ({ reply }) => reply.ok(order))`.
 * Register it with `server.use(...)`.
 */
export function mockApi<M extends HttpMethod, S extends MockPath<M>>(
  method: M,
  path: S,
  resolver: MockResolver<Operation<M, S>>,
  options: MockApiOptions = {},
) {
  const url = `${options.base ?? TEST_API_BASE}${toMswPath(path)}`;
  const kit = replyKit<Operation<M, S>>();
  return http[method](url, async (info) => {
    const { status, body } = await resolver({ ...info, reply: kit });
    return body === undefined
      ? new HttpResponse(null, { status })
      : HttpResponse.json(body as Record<string, unknown>, { status });
  });
}

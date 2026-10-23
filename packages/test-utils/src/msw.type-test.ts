// Compile-time checks (run by `tsc`): mocks must follow the OpenAPI contract. Each `@ts-expect-error` must
// stay an error.
import { governorateFactory } from './factories/governorate';
import { mockApi } from './msw';

export const typedMocks = [
  mockApi('get', '/governorates', ({ reply }) => reply.ok([governorateFactory()])),
  // @ts-expect-error The path is not in the snapshot.
  mockApi('get', '/nowhere', ({ reply }) => reply.noContent()),
  // @ts-expect-error There is no POST on this path.
  mockApi('post', '/governorates', ({ reply }) => reply.noContent()),
  // @ts-expect-error The data must be the documented type (an array of governorates).
  mockApi('get', '/governorates', ({ reply }) => reply.ok({ id: 'x' })),
  // @ts-expect-error The error code must be in the catalogue.
  mockApi('get', '/governorates', ({ reply }) => reply.error(404, 'NOT_A_CODE')),
];

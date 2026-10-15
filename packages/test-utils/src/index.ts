// Public interface of @nile/test-utils (design 01 §2). React render helpers: `@nile/test-utils/react`.
// Backend, Mailpit and account helpers for contract and E2E tests: `@nile/test-utils/e2e`.
export { errorBody, okBody, TEST_CORRELATION_ID, type ErrorBodyInit } from './envelope';
export {
  mockApi,
  TEST_API_BASE,
  TEST_API_ORIGIN,
  toMswPath,
  type HttpMethod,
  type MockApiOptions,
  type MockPath,
  type MockReply,
  type MockResolver,
  type ReplyKit,
} from './msw';
export { defineFactory, fixtureId, type Factory, type FactoryBuild } from './factory';
export { AUTH_FIXTURE_NOW, authTokensFactory } from './factories/auth';
export { addressFactory } from './factories/address';
export { governorateFactory } from './factories/governorate';
export { orderDetailFactory } from './factories/order';

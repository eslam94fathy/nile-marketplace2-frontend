// Node-only helpers for suites that run against the real backend (contract tests, Playwright fixtures).
export {
  createAccounts,
  randomPassword,
  randomPhone,
  uniqueEmail,
  type Account,
  type Accounts,
  type Role,
} from './accounts';
export {
  createBackend,
  describeResponse,
  expectData,
  type Backend,
  type BackendMethod,
  type BackendRequest,
  type BackendResponse,
} from './backend';
export { e2eEnv, type E2eEnv } from './env';
export {
  createMailpit,
  EMAIL_SUBJECTS,
  inviteTokenFromEmail,
  otpFromEmail,
  type EmailKind,
  type Mailpit,
} from './mailpit';

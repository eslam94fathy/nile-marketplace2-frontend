import { randomInt, randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { createBackend, expectData, type Backend } from './backend';
import { e2eEnv, type E2eEnv } from './env';
import { createMailpit, inviteTokenFromEmail, otpFromEmail, type Mailpit } from './mailpit';

// Fresh accounts per role for contract and E2E tests (design 01 §12.3): every test gets its own users with
// unique emails, so no test depends on another's data. Only the admin is shared: the backend creates the
// first admin with its `seed-admin` command, never through the API.

export type Role = Schema<'AuthUserDto'>['role'];

export interface Account {
  readonly role: Role;
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  readonly accessToken: string;
}

const PATHS = {
  registerCustomer: '/api/v1/auth/register/customer',
  registerSeller: '/api/v1/auth/register/seller',
  verifyEmail: '/api/v1/auth/email/verify',
  login: '/api/v1/auth/login',
  acceptInvite: '/api/v1/auth/invite/accept',
  governorates: '/api/v1/governorates',
  approveSeller: (sellerId: string) => `/api/v1/admin/sellers/${sellerId}/approve`,
  createAgent: '/api/v1/admin/delivery-agents',
} as const;

/**
 * The test admin signs in again this long before its access token expires: E2E runs with 2-minute tokens
 * (design 01 R-21), so one token doesn't last a whole run.
 */
export const ADMIN_TOKEN_RENEW_MARGIN_MS = 30_000;

const TEST_EMAIL_DOMAIN = 'example.test';
const DEVICE_NAME = 'Nile web tests';

/** `e2e+seller-<uuid>@example.test`: unique, and recognisable in Mailpit and the database. */
export function uniqueEmail(label: string): string {
  return `e2e+${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

/** A random password that meets the backend policy (≥ 8 characters, ASCII, so well under 72 bytes). */
export function randomPassword(): string {
  return `E2e-${randomUUID()}`;
}

/** A random Egyptian mobile number in E.164 (`+2010` + 8 digits). */
export function randomPhone(): string {
  return `+2010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

function toAccount(tokens: Schema<'AuthTokensDto'>, password: string): Account {
  return {
    role: tokens.user.role,
    userId: tokens.user.id,
    email: tokens.user.email,
    password,
    accessToken: tokens.accessToken,
  };
}

export interface Accounts {
  readonly backend: Backend;
  readonly mailpit: Mailpit;
  /**
   * The seeded test admin, signed in once per access token and reused (strict-auth rate limits count per email);
   * signed in again shortly before the token expires.
   */
  admin(): Promise<Account>;
  customer(): Promise<Account>;
  /** A seller with a verified email; `approved: true` (default) also has the admin approve it. */
  seller(options?: { readonly approved?: boolean }): Promise<Account & { readonly sellerId: string }>;
  /** A delivery agent created by the admin, invite accepted. */
  agent(): Promise<Account & { readonly agentId: string }>;
}

export interface AccountsOptions {
  /** Tests only: a fake backend. */
  readonly backend?: Backend;
  /** Tests only: a fixed clock. */
  readonly now?: () => number;
}

export function createAccounts(env: E2eEnv = e2eEnv(), options: AccountsOptions = {}): Accounts {
  const backend = options.backend ?? createBackend(env.NILE_API_BASE_URL);
  const now = options.now ?? Date.now;
  const mailpit = createMailpit(env.MAILPIT_URL);
  let adminSession: Promise<{ readonly account: Account; readonly expiresAtMs: number }> | undefined;

  async function verifyEmail(email: string, password: string, register: () => Promise<unknown>) {
    const text = await mailpit.awaitEmail(email, 'verification', register);
    const response = await backend.request('POST', PATHS.verifyEmail, {
      body: { email, otp: otpFromEmail(text) } satisfies Schema<'VerifyEmailDto'>,
    });
    return toAccount(expectData(response, 200) as Schema<'AuthTokensDto'>, password);
  }

  async function acceptInvite(inviteText: string, password: string): Promise<Account> {
    const response = await backend.request('POST', PATHS.acceptInvite, {
      body: { token: inviteTokenFromEmail(inviteText), password } satisfies Schema<'AcceptInviteDto'>,
    });
    return toAccount(expectData(response, 200) as Schema<'AuthTokensDto'>, password);
  }

  async function firstGovernorateId(): Promise<string> {
    const response = await backend.request('GET', PATHS.governorates);
    const [first] = expectData(response, 200) as Schema<'GovernorateDto'>[];
    if (!first) throw new Error('No governorates: run the backend migrations');
    return first.id;
  }

  const adminLogin = () =>
    backend.request('POST', PATHS.login, {
      body: {
        email: env.E2E_ADMIN_EMAIL,
        password: env.E2E_ADMIN_PASSWORD,
        deviceName: DEVICE_NAME,
      } satisfies Schema<'LoginDto'>,
    });

  async function signInAdmin() {
    const { E2E_ADMIN_EMAIL: email, E2E_ADMIN_PASSWORD: password } = env;
    let response = await adminLogin();
    if (response.status !== 200) {
      // First run after `seed-admin`: the admin is still invited. Accept its invite with the configured password.
      const invite = await mailpit.latestEmail(email, 'invite');
      if (invite === undefined) {
        throw new Error(
          `Test admin can't sign in (${response.status}) and has no invite: run the backend's seed-admin`,
        );
      }
      await acceptInvite(invite, password);
      response = await adminLogin();
    }
    const tokens = expectData(response, 200) as Schema<'AuthTokensDto'>;
    return { account: toAccount(tokens, password), expiresAtMs: Date.parse(tokens.accessTokenExpiresAt) };
  }

  async function admin(): Promise<Account> {
    // A failed sign-in isn't remembered: the next caller tries again.
    const current = await adminSession?.catch(() => undefined);
    if (current === undefined || current.expiresAtMs - now() < ADMIN_TOKEN_RENEW_MARGIN_MS) {
      adminSession = signInAdmin();
      return (await adminSession).account;
    }
    return current.account;
  }

  return {
    backend,
    mailpit,
    admin,
    async customer() {
      const email = uniqueEmail('customer');
      const password = randomPassword();
      return verifyEmail(email, password, async () => {
        const response = await backend.request('POST', PATHS.registerCustomer, {
          body: {
            email,
            password,
            firstName: 'E2E',
            lastName: 'Customer',
            phone: randomPhone(),
          } satisfies Schema<'RegisterCustomerDto'>,
        });
        expectData(response, 201);
      });
    },
    async seller({ approved = true } = {}) {
      const email = uniqueEmail('seller');
      const password = randomPassword();
      const governorateId = await firstGovernorateId();
      let sellerId = '';
      const account = await verifyEmail(email, password, async () => {
        const response = await backend.request('POST', PATHS.registerSeller, {
          body: {
            email,
            password,
            businessName: `E2E Seller ${randomUUID().slice(0, 8)}`,
            contactPhone: randomPhone(),
            pickupAddress: {
              governorateId,
              city: 'Cairo',
              area: 'Downtown',
              street: 'Test street',
              building: '1',
            },
          } satisfies Schema<'RegisterSellerDto'>,
        });
        sellerId = (expectData(response, 201) as Schema<'RegisteredSellerDto'>).sellerId;
      });
      if (approved) {
        const { accessToken } = await admin();
        expectData(await backend.request('POST', PATHS.approveSeller(sellerId), { token: accessToken }), 200);
      }
      return { ...account, sellerId };
    },
    async agent() {
      const { accessToken } = await admin();
      const email = uniqueEmail('agent');
      const password = randomPassword();
      const homeGovernorateId = await firstGovernorateId();
      let agentId = '';
      const invite = await mailpit.awaitEmail(email, 'invite', async () => {
        const response = await backend.request('POST', PATHS.createAgent, {
          token: accessToken,
          body: {
            email,
            fullName: 'E2E Agent',
            phone: randomPhone(),
            homeGovernorateId,
          } satisfies Schema<'CreateAgentDto'>,
        });
        agentId = (expectData(response, 201) as Schema<'AdminAgentDto'>).id;
      });
      return { ...(await acceptInvite(invite, password)), agentId };
    },
  };
}

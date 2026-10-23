import { defineFactory, fixtureId } from '../factory';

/** Clock the auth fixtures are built around: tokens below are valid at this instant. */
export const AUTH_FIXTURE_NOW = new Date('2026-10-14T08:00:00.000Z');

/**
 * `AuthTokensDto` for a customer: access token valid 15 min and refresh token 30 days after
 * `AUTH_FIXTURE_NOW`. Tokens are recognisable fakes (`test-access-<n>`, 43-character refresh token).
 */
export const authTokensFactory = defineFactory<'AuthTokensDto'>((sequence) => ({
  accessToken: `test-access-${sequence}`,
  accessTokenExpiresAt: '2026-10-14T08:15:00.000Z',
  refreshToken: `test-refresh-${String(sequence).padStart(4, '0')}`.padEnd(43, 'x'),
  refreshTokenExpiresAt: '2026-11-13T08:00:00.000Z',
  user: {
    id: fixtureId(sequence),
    email: `user${sequence}@example.test`,
    role: 'customer',
    status: 'active',
  },
}));

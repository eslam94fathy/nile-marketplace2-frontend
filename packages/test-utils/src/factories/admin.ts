import { defineFactory, fixtureId } from '../factory';

/** `AdminListItemDto`: an active admin who has signed in. Ids start at 9500. */
export const adminListItemFactory = defineFactory<'AdminListItemDto'>((sequence) => ({
  id: fixtureId(9500 + sequence),
  email: `admin${sequence}@example.test`,
  status: 'active',
  emailVerifiedAt: '2026-10-14T09:00:00.000Z',
  lastLoginAt: '2026-10-15T09:00:00.000Z',
  createdAt: '2026-10-14T08:00:00.000Z',
}));

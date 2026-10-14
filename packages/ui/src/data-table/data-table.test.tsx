// @vitest-environment jsdom
// T-C2 acceptance: DataTable over two real cursor pages (TanStack Query + typed MSW), sort headers that emit
// the API sort value, and never a total or a page number.
import { createApiClient, serverTransport, unwrap, type Schema } from '@nile/api';
import { USER_STATUS_LABELS } from '@nile/domain';
import { infiniteListOptions } from '@nile/query';
import { defineFactory, fixtureId, mockApi, TEST_API_ORIGIN } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StatusBadge } from '../components/badge';
import { DateTime } from '../components/formatted';
import { EmptyState } from '../components/states';
import { USER_STATUS_TONES } from '../status-tones';
import { expectNoAxeViolations } from '../test/axe';
import { DataTable, type DataTableColumn } from './data-table';
import { formatSort, nextSort, parseSort } from './sort';

type Admin = Schema<'AdminListItemDto'>;

// The endpoint's allowed sort values come from the snapshot; the table emits strings, the app narrows them.
const ADMIN_SORTS = ['createdAt', '-createdAt'] as const;
type AdminSort = (typeof ADMIN_SORTS)[number];
const isAdminSort = (value: string): value is AdminSort => (ADMIN_SORTS as readonly string[]).includes(value);

const adminFactory = defineFactory<'AdminListItemDto'>((sequence) => ({
  id: fixtureId(sequence),
  email: `admin${sequence}@example.test`,
  status: 'active',
  emailVerifiedAt: '2026-10-01T08:00:00.000Z',
  lastLoginAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
}));

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));

const COLUMNS: DataTableColumn<Admin>[] = [
  { id: 'email', header: 'Email', cell: (row) => row.email },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge value={row.status} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />,
  },
  {
    id: 'created',
    header: 'Created',
    sortField: 'createdAt',
    firstDirection: 'desc',
    cell: (row) => <DateTime value={row.createdAt} />,
  },
];

function AdminsTable() {
  const [sort, setSort] = useState<AdminSort | undefined>();
  const query = useInfiniteQuery(
    infiniteListOptions({
      queryKey: ['test', 'admins', sort ?? ''],
      fetchPage: (cursor, signal) =>
        unwrap(
          api.GET('/api/v1/admin/admins', {
            params: {
              query: { ...(cursor === undefined ? {} : { cursor }), ...(sort === undefined ? {} : { sort }) },
            },
            signal,
          }),
        ) as Promise<{ data: Admin[]; meta: Schema<'PageMeta'> }>,
    }),
  );
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <>
      <p data-testid="sort">{sort ?? 'default'}</p>
      <DataTable
        caption="Admins"
        columns={COLUMNS}
        rows={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={(next) => {
          if (isAdminSort(next)) setSort(next);
        }}
        loading={query.isPending}
        empty={<EmptyState title="No admins yet." />}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
    </>
  );
}

describe('DataTable', () => {
  it('loads a second cursor page with "Load more", without totals or page numbers', async () => {
    const first = [adminFactory(), adminFactory()];
    const second = [adminFactory({ status: 'invited', emailVerifiedAt: null })];
    const cursors: (string | null)[] = [];
    server.use(
      mockApi('get', '/admin/admins', ({ request, reply }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return cursor === null
          ? reply.ok(first, { nextCursor: 'cursor-2', hasMore: true, limit: 2 })
          : reply.ok(second, { nextCursor: null, hasMore: false, limit: 2 });
      }),
    );
    const { user } = renderWithProviders(<AdminsTable />);

    const table = await screen.findByRole('table', { name: 'Admins' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('admin3@example.test')).toBeDefined();
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3);
    expect(cursors).toEqual([null, 'cursor-2']);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(screen.getByText('Invited')).toBeDefined();
    expect(document.body.textContent).not.toMatch(/\bpage \d|\bof \d+|\btotal\b|\d+ results?/i);
    await expectNoAxeViolations();
  });

  it('sort headers emit the API sort value and expose aria-sort', async () => {
    const sorts: (string | null)[] = [];
    server.use(
      mockApi('get', '/admin/admins', ({ request, reply }) => {
        sorts.push(new URL(request.url).searchParams.get('sort'));
        return reply.ok([adminFactory()], { nextCursor: null, hasMore: false, limit: 20 });
      }),
    );
    const { user } = renderWithProviders(<AdminsTable />);
    await screen.findByRole('table');

    const created = () => screen.getByRole('columnheader', { name: /Created/ });
    expect(created().getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('columnheader', { name: 'Email' }).getAttribute('aria-sort')).toBeNull();

    await user.click(within(created()).getByRole('button'));
    expect(screen.getByTestId('sort').textContent).toBe('-createdAt');
    expect(created().getAttribute('aria-sort')).toBe('descending');

    await user.click(within(created()).getByRole('button'));
    expect(screen.getByTestId('sort').textContent).toBe('createdAt');
    expect(created().getAttribute('aria-sort')).toBe('ascending');
    await screen.findByRole('table');
    expect(sorts).toEqual([null, '-createdAt', 'createdAt']);
  });

  it('shows the empty state instead of an empty table', async () => {
    server.use(
      mockApi('get', '/admin/admins', ({ reply }) =>
        reply.ok([], { nextCursor: null, hasMore: false, limit: 20 }),
      ),
    );
    renderWithProviders(<AdminsTable />);
    expect(await screen.findByText('No admins yet.')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('sort helpers', () => {
  it('parse and format the API sort parameter', () => {
    expect(parseSort('-createdAt')).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(parseSort('name')).toEqual({ field: 'name', direction: 'asc' });
    expect(parseSort(undefined)).toBeUndefined();
    expect(parseSort('-')).toBeUndefined();
    expect(formatSort({ field: 'price', direction: 'desc' })).toBe('-price');
  });

  it('flips the same column and starts a new one with its first direction', () => {
    expect(nextSort(undefined, 'createdAt', 'desc')).toBe('-createdAt');
    expect(nextSort('-createdAt', 'createdAt')).toBe('createdAt');
    expect(nextSort('createdAt', 'createdAt')).toBe('-createdAt');
    expect(nextSort('-createdAt', 'email')).toBe('email');
  });
});

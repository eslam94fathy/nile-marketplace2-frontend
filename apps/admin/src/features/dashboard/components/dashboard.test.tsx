// @vitest-environment jsdom
import { fixtureId } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dashboard } from './dashboard';
import { QueueCard } from './queue-card';

// The frame (decided 2026-10-15: queues arrive with their tasks); the card is checked with fixed pages.

interface Row {
  readonly id: string;
  readonly name: string;
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: fixtureId(index + 1),
    name: `Item ${String(index + 1)}`,
  }));

const card = (props: Partial<Parameters<typeof QueueCard<Row>>[0]> = {}) => (
  <QueueCard<Row>
    title="Sellers waiting for approval"
    seeAllHref="/sellers"
    seeAllLabel="See all sellers waiting for approval"
    isError={false}
    onRetry={() => undefined}
    page={{ data: rows(2), meta: { nextCursor: null, hasMore: false, limit: 5 } }}
    getRowId={(row) => row.id}
    renderRow={(row) => row.name}
    {...props}
  />
);

describe('dashboard (spec 03 AD-02)', () => {
  it('the page heading', () => {
    renderWithProviders(<Dashboard queues={[]} figures={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeDefined();
  });

  it('a card: up to 5 rows and "See all"', () => {
    renderWithProviders(
      card({ page: { data: rows(7), meta: { nextCursor: 'x', hasMore: true, limit: 5 } } }),
    );
    const section = screen.getByRole('region', { name: 'Sellers waiting for approval' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(5);
    expect(within(section).getByText('More…')).toBeDefined();
    expect(
      within(section)
        .getByRole('link', { name: 'See all sellers waiting for approval' })
        .getAttribute('href'),
    ).toBe('/sellers');
  });

  it('no "More…" without more; "Nothing waiting." when empty; skeleton while loading; error with retry', () => {
    const view = renderWithProviders(card());
    expect(screen.queryByText('More…')).toBeNull();
    view.rerender(card({ page: { data: [], meta: { nextCursor: null, hasMore: false, limit: 5 } } }));
    expect(screen.getByText('Nothing waiting.')).toBeDefined();
    view.rerender(card({ page: undefined }));
    expect(screen.queryByRole('listitem')).toBeNull();
    view.rerender(card({ isError: true }));
    expect(screen.getByText("This queue couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('cards render in a grid', () => {
    renderWithProviders(
      <Dashboard queues={[() => card(), () => card({ title: 'Unassigned shipments' })]} figures={false} />,
    );
    expect(screen.getByRole('region', { name: 'Sellers waiting for approval' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Unassigned shipments' })).toBeDefined();
  });
});

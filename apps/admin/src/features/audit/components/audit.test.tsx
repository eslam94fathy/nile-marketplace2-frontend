// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { adminListItemFactory, auditEntryFactory, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { AuditEntryDetail } from './audit-entry';
import { AuditLog } from './audit-log';
import { HistoryLink } from './history-link';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Entry = Schema<'AuditEntryDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const OTHER = adminListItemFactory({ email: 'ola@example.test' });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(mockApi('get', '/admin/admins', ({ reply }) => reply.ok([OTHER, ME], PAGE), { base: BFF_BASE }));
});

function serveList(rows: Entry[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/audit-log',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

const serveEntry = (entry: Entry) => {
  server.use(
    mockApi('get', '/admin/audit-log/{entryId}', ({ reply }) => reply.ok(entry), { base: BFF_BASE }),
  );
};

const renderLog = (params: Record<string, string> = {}) =>
  renderWithProviders(<AuditLog params={params} currentUserId={ME.id} />);

describe('audit log (spec 03 AD-38, T-M10)', { timeout: 15_000 }, () => {
  it('newest first; rows show time, actor ("You", email, command line), action link, target link and reason', async () => {
    const mine = auditEntryFactory({ actor: { userId: ME.id, email: ME.email } });
    const theirs = auditEntryFactory({
      action: 'user.suspended',
      targetType: 'user',
      actor: { userId: OTHER.id, email: OTHER.email },
      changes: { before: { status: 'active' }, after: { status: 'suspended' } },
      reason: 'Fraudulent orders',
    });
    const cli = auditEntryFactory({
      actorType: 'cli',
      actor: null,
      action: 'admin.seeded',
      targetType: 'user',
      changes: { before: {}, after: { email: 'first@example.test' } },
    });
    const queries = serveList([mine, theirs, cli]);
    renderLog();
    const table = await screen.findByRole('table', { name: 'Audit entries, newest first' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt' });
    expect(
      screen.getByText(
        "Every change made by an admin or from the command line. Viewing pages isn't recorded.",
      ),
    ).toBeDefined();
    const rows = within(table).getAllByRole('row');
    const row = (index: number) => {
      const found = rows[index];
      if (found === undefined) throw new Error(`no row ${String(index)}`);
      return within(found);
    };
    expect(row(1).getByText('You')).toBeDefined();
    expect(row(1).getByRole('link', { name: 'Seller commission changed' }).getAttribute('href')).toBe(
      `/audit/${mine.id}`,
    );
    expect(
      row(1)
        .getByRole('link', { name: `Seller ${(mine.targetId ?? '').slice(0, 8)}` })
        .getAttribute('href'),
    ).toBe(`/sellers/${mine.targetId ?? ''}`);
    expect(row(2).getByText(OTHER.email)).toBeDefined();
    expect(row(2).getByText('Fraudulent orders')).toBeDefined();
    // A user has no console screen: plain text.
    expect(row(2).queryByRole('link', { name: /^User [0-9a-f]{8}$/ })).toBeNull();
    expect(row(3).getByText('System (command line)')).toBeDefined();
  });

  it('actor, action and date filters navigate', async () => {
    serveList([]);
    const view = renderLog();
    await view.user.click(await screen.findByRole('combobox', { name: 'Changed by' }));
    expect(await screen.findByRole('option', { name: 'You' })).toBeDefined();
    await view.user.click(await screen.findByRole('option', { name: OTHER.email }));
    expect(router.push).toHaveBeenLastCalledWith(`/audit?actor=${OTHER.id}`);

    await view.user.click(screen.getByText('All actions'));
    await view.user.click(screen.getByRole('checkbox', { name: 'Seller approved' }));
    expect(router.push).toHaveBeenLastCalledWith('/audit?action=seller.approved');
    expect(within(screen.getByRole('group', { name: 'Coupons' })).getAllByRole('checkbox')).toHaveLength(4);

    await view.user.type(screen.getByLabelText('From'), '2026-10-01');
    expect(router.replace).toHaveBeenLastCalledWith('/audit?from=2026-10-01');
  });

  it('several actions are sent as [in] and can be cleared', async () => {
    const queries = serveList([]);
    const view = renderLog({ action: 'payout.recorded,cod_remittance.recorded' });
    await waitFor(() => {
      expect(queries[0]?.['action[in]']).toBe('cod_remittance.recorded,payout.recorded');
    });
    expect(screen.getByText('2 chosen')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Clear actions' }));
    expect(router.push).toHaveBeenLastCalledWith('/audit');
  });

  it('the target id needs a target type and a whole id', async () => {
    serveList([]);
    const view = renderLog();
    expect((await screen.findByRole('textbox', { name: 'Target id' })).hasAttribute('disabled')).toBe(true);
    await view.user.click(screen.getByRole('combobox', { name: 'Target' }));
    await view.user.click(await screen.findByRole('option', { name: 'Order' }));
    expect(router.push).toHaveBeenLastCalledWith('/audit?target=order');
  });

  it('a History link filters by target; a partial id is refused before sending', async () => {
    const id = fixtureId(42);
    const queries = serveList([]);
    const view = renderLog({ target: 'order', targetId: id });
    await waitFor(() => {
      expect(queries[0]).toEqual({
        limit: '20',
        sort: '-createdAt',
        'targetType[eq]': 'order',
        'targetId[eq]': id,
      });
    });
    const field = screen.getByRole('textbox', { name: 'Target id' });
    expect((field as HTMLInputElement).value).toBe(id);
    await view.user.clear(field);
    await view.user.type(field, id.slice(0, 8));
    await view.user.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Enter the whole id.')).toBeDefined();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(router.push).not.toHaveBeenCalled();
    expect(await screen.findByText('No changes match these filters.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/audit');
  });

  it('a failed list offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/audit-log', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderLog();
    expect(await screen.findByText("The audit log couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('HistoryLink opens AD-38 filtered to its target', () => {
    const id = fixtureId(7);
    renderWithProviders(<HistoryLink targetType="payment_refund" targetId={id} />);
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
      `/audit?target=payment_refund&targetId=${id}`,
    );
  });
});

describe('audit entry (spec 03 AD-39, T-M10)', { timeout: 15_000 }, () => {
  const renderEntry = (entry: Entry) =>
    renderWithProviders(
      <>
        <AuditEntryDetail entryId={entry.id} currentUserId={ME.id} />
        <Toaster />
      </>,
    );

  it('every field, the changes as Field · Before · After, ids with Copy', async () => {
    const entry = auditEntryFactory({
      action: 'seller.suspended',
      changes: { before: { status: 'approved' }, after: { status: 'suspended' } },
      reason: 'Selling counterfeit goods',
    });
    serveEntry(entry);
    const view = renderEntry(entry);
    expect(await screen.findByRole('heading', { level: 1, name: 'Seller suspended' })).toBeDefined();
    const details = screen.getByLabelText('Entry details');
    expect(within(details).getByText(entry.actor?.email ?? '')).toBeDefined();
    expect(
      within(details)
        .getByRole('link', { name: `Seller ${entry.targetId ?? ''}` })
        .getAttribute('href'),
    ).toBe(`/sellers/${entry.targetId ?? ''}`);
    expect(within(details).getByText('Selling counterfeit goods')).toBeDefined();
    expect(within(details).getByText('203.0.113.7')).toBeDefined();
    const changes = screen.getByRole('table', { name: 'Recorded fields before and after the change' });
    // Regression (T-O4 E2E): the sideways-scrolling box is reachable by keyboard.
    const scroller = screen.getByRole('region', { name: 'Recorded fields before and after the change' });
    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(scroller.contains(changes)).toBe(true);
    const row = within(changes).getByRole('row', { name: /Status/ });
    expect(within(row).getByText('Approved')).toBeDefined();
    expect(within(row).getByText('Suspended')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Copy correlation id' }));
    // user-event installs its own clipboard stub.
    expect(await navigator.clipboard.readText()).toBe(entry.correlationId);
    expect(await screen.findByText('Copied.')).toBeDefined();
  });

  it('a command-line entry without changes, reason or IP', async () => {
    const entry = auditEntryFactory({
      actorType: 'cli',
      actor: null,
      action: 'user.invite_resent',
      targetType: 'user',
      changes: null,
      correlationId: null,
      ip: null,
    });
    serveEntry(entry);
    renderEntry(entry);
    expect(await screen.findByRole('heading', { level: 1, name: 'Invite resent' })).toBeDefined();
    expect(screen.getByText('System (command line)')).toBeDefined();
    expect(screen.getByText('No recorded field changed.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull();
    expect(screen.queryByText('Reason')).toBeNull();
  });

  it('a create shows the missing before values as not recorded', async () => {
    const entry = auditEntryFactory({
      action: 'category.created',
      targetType: 'category',
      changes: { before: {}, after: { name: 'Shoes' } },
    });
    serveEntry(entry);
    renderEntry(entry);
    const changes = await screen.findByRole('table', { name: 'Recorded fields before and after the change' });
    const row = within(changes).getByRole('row', { name: /Name/ });
    expect(within(row).getByText('Not recorded')).toBeDefined();
    expect(within(row).getByText('Shoes')).toBeDefined();
  });

  it('an unknown entry is not found, with a way back', async () => {
    server.use(
      mockApi('get', '/admin/audit-log/{entryId}', ({ reply }) => reply.error(404, 'AUDIT_ENTRY_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderEntry(auditEntryFactory());
    expect(await screen.findByText("This audit entry doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to the audit log' }).getAttribute('href')).toBe('/audit');
  });

  it('a failed read offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/audit-log/{entryId}', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderEntry(auditEntryFactory());
    expect(await screen.findByText("This audit entry couldn't be loaded.")).toBeDefined();
  });
});

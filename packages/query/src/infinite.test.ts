import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { getNextPageParam, infiniteListOptions, type Page } from './infinite';
import { queryKey } from './keys';

const page = (ids: string[], nextCursor: string | null, hasMore: boolean): Page<{ id: string }> => ({
  data: ids.map((id) => ({ id })),
  meta: { nextCursor, hasMore, limit: ids.length },
});

describe('getNextPageParam', () => {
  it('follows nextCursor while hasMore', () => {
    expect(getNextPageParam(page(['a'], 'c2', true))).toBe('c2');
  });

  it('ends the list when hasMore is false or the cursor is null', () => {
    expect(getNextPageParam(page(['a'], 'c2', false))).toBeUndefined();
    expect(getNextPageParam(page(['a'], null, true))).toBeUndefined();
  });
});

describe('infiniteListOptions', () => {
  it('starts without a cursor, follows the cursors and stops at the last page', async () => {
    const pages: Record<string, Page<{ id: string }>> = {
      first: page(['a', 'b'], 'c2', true),
      c2: page(['c', 'd'], 'c3', true),
      c3: page(['e'], null, false),
    };
    const fetchPage = vi.fn((cursor: string | undefined) => {
      const result = pages[cursor ?? 'first'];
      if (!result) throw new Error(`unexpected cursor ${String(cursor)}`);
      return Promise.resolve(result);
    });
    const client = new QueryClient();
    const options = infiniteListOptions({ queryKey: queryKey('seller', 'orders', 'list', {}), fetchPage });

    const result = await client.infiniteQuery({ ...options, pages: 5 });

    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c2', 'c3']);
    expect(result.pages.flatMap((p) => p.data.map((item) => item.id))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.pageParams).toEqual([undefined, 'c2', 'c3']);
  });

  it('passes an abort signal to every page fetch', async () => {
    const fetchPage = vi.fn((_cursor: string | undefined, signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(page([], null, false));
    });
    await new QueryClient().infiniteQuery(
      infiniteListOptions({ queryKey: queryKey('agent', 'shipments', 'history'), fetchPage }),
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

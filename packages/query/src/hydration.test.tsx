// @vitest-environment jsdom
// T-B5 acceptance: a query prefetched on the server hydrates on the client without a second request.
import { browserTransport, createApiClient, serverTransport, type ApiClient } from '@nile/api';
import { dehydrate, HydrationBoundary, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { categoriesTreeQuery } from './public-queries';
import { makeQueryClient } from './query-client';

const BACKEND = 'http://backend.test';
const BFF = 'http://app.test/api/bff';

const TREE = [
  {
    id: '01a125e5-0e14-763a-a68f-005e0439cf6c',
    name: 'Electronics',
    slug: 'electronics',
    sortOrder: 0,
    children: [],
  },
];

let backendRequests = 0;
let bffRequests = 0;
const server = setupServer(
  http.get(`${BACKEND}/api/v1/categories`, () => {
    backendRequests += 1;
    return HttpResponse.json({ success: true, data: TREE });
  }),
  http.get(`${BFF}/categories`, () => {
    bffRequests += 1;
    return HttpResponse.json({ success: true, data: TREE });
  }),
);
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  cleanup();
  backendRequests = 0;
  bffRequests = 0;
});
afterAll(() => {
  server.close();
});

function CategoryNames({ api }: { readonly api: ApiClient }) {
  const { data, isFetching } = useQuery(categoriesTreeQuery(api));
  return (
    <ul data-fetching={String(isFetching)}>
      {data?.map((category) => (
        <li key={category.id}>{category.name}</li>
      ))}
    </ul>
  );
}

/** What a Server Component does: prefetch with its own client, then hand the dehydrated state down. */
async function renderOnServer() {
  const serverClient = makeQueryClient();
  const serverApi = createApiClient(serverTransport({ baseUrl: BACKEND }));
  await serverClient.query(categoriesTreeQuery(serverApi));
  return dehydrate(serverClient);
}

describe('server prefetch + HydrationBoundary', () => {
  it('renders the server data on the client without refetching', async () => {
    const state = await renderOnServer();
    expect(backendRequests).toBe(1);

    const browserClient = makeQueryClient();
    const browserApi = createApiClient(browserTransport({ bffBaseUrl: BFF }));
    render(
      <QueryClientProvider client={browserClient}>
        <HydrationBoundary state={state}>
          <CategoryNames api={browserApi} />
        </HydrationBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Electronics')).toBeDefined();
    // Give any mount/focus refetch the chance to start before checking that none did.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(bffRequests).toBe(0);
    expect(screen.getByRole('list').dataset.fetching).toBe('false');
  });

  it('fetches through the BFF when nothing was prefetched (control)', async () => {
    const browserClient = makeQueryClient();
    const browserApi = createApiClient(browserTransport({ bffBaseUrl: BFF }));
    render(
      <QueryClientProvider client={browserClient}>
        <CategoryNames api={browserApi} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Electronics')).toBeDefined();
    expect(bffRequests).toBe(1);
  });
});

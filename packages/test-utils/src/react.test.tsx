// @vitest-environment jsdom
import { createApiClient, serverTransport, unwrap } from '@nile/api';
import { useQuery } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockApi, TEST_API_ORIGIN } from './msw';
import { renderWithProviders } from './react';

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));

function Governorates() {
  const { data, isError } = useQuery({
    queryKey: ['test', 'governorates'],
    queryFn: async () => (await unwrap(api.GET('/api/v1/governorates'))).data,
  });
  if (isError) return <p>Failed</p>;
  return <p>{data === undefined ? 'Loading' : `${data.length} governorates`}</p>;
}

describe('renderWithProviders', () => {
  it('renders inside a query client and exposes it', async () => {
    server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([])));
    const { queryClient } = renderWithProviders(<Governorates />);
    expect(await screen.findByText('0 governorates')).toBeDefined();
    expect(queryClient.getQueryData(['test', 'governorates'])).toEqual([]);
  });

  it('does not retry: a 5xx shows the error state at once', async () => {
    let calls = 0;
    server.use(
      mockApi('get', '/governorates', ({ reply }) => {
        calls += 1;
        return reply.error(503, 'SERVICE_UNAVAILABLE');
      }),
    );
    renderWithProviders(<Governorates />);
    expect(await screen.findByText('Failed')).toBeDefined();
    expect(calls).toBe(1);
  });

  it('returns a user-event instance', () => {
    const { user } = renderWithProviders(<button type="button">Go</button>);
    expect(typeof user.click).toBe('function');
  });
});

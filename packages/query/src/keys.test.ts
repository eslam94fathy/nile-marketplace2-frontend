import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { clearPrivateQueries, publicKeys, queryKey } from './keys';

describe('queryKey', () => {
  it('builds [scope, resource, kind] and [scope, resource, kind, params]', () => {
    expect(queryKey('storefront', 'cart', 'detail')).toEqual(['storefront', 'cart', 'detail']);
    expect(queryKey('seller', 'orders', 'list', { status: ['placed'] })).toEqual([
      'seller',
      'orders',
      'list',
      { status: ['placed'] },
    ]);
  });

  it('builds the shared public keys', () => {
    expect(publicKeys.categoriesTree()).toEqual(['public', 'categories', 'tree']);
    expect(publicKeys.categoryAttributes('c1')).toEqual([
      'public',
      'categories',
      'attributes',
      { categoryId: 'c1' },
    ]);
    expect(publicKeys.governorates()).toEqual(['public', 'governorates', 'list']);
  });
});

describe('clearPrivateQueries', () => {
  it('removes user data and keeps public data', () => {
    const client = new QueryClient();
    client.setQueryData(publicKeys.categoriesTree(), []);
    client.setQueryData(queryKey('storefront', 'cart', 'detail'), { id: 'cart' });
    client.setQueryData(queryKey('storefront', 'orders', 'list', { status: [] }), []);

    clearPrivateQueries(client);

    expect(client.getQueryData(publicKeys.categoriesTree())).toEqual([]);
    expect(client.getQueryData(queryKey('storefront', 'cart', 'detail'))).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });
});

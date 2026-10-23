import type { Schema } from '@nile/api';
import { fixtureId, mockApi, sellerProfileFactory } from '@nile/test-utils';
import { BFF_BASE, type setupMswServer } from '@/test/msw';

type Server = ReturnType<typeof setupMswServer>;

// Shared set-up of the product screens' component tests (not a test file itself).

export const CATEGORY_ID = fixtureId(3000);
export const OTHER_CATEGORY_ID = fixtureId(3001);

export const TREE: Schema<'CategoryNodeDto'>[] = [
  {
    id: CATEGORY_ID,
    name: 'Fashion',
    slug: 'fashion',
    sortOrder: 0,
    image: null,
    children: [
      { id: OTHER_CATEGORY_ID, name: 'Shirts', slug: 'shirts', sortOrder: 0, image: null, children: [] },
    ],
  },
];

export const SIZE: Schema<'EffectiveAttributeDto'> = {
  id: fixtureId(5001),
  code: 'size',
  name: 'Size',
  sortOrder: 0,
  definedOnCategoryId: CATEGORY_ID,
  options: [
    { id: fixtureId(6001), code: 's', value: 'S', sortOrder: 0 },
    { id: fixtureId(6002), code: 'm', value: 'M', sortOrder: 1 },
  ],
};

export const COLOR: Schema<'EffectiveAttributeDto'> = {
  id: fixtureId(5002),
  code: 'color',
  name: 'Color',
  sortOrder: 1,
  definedOnCategoryId: CATEGORY_ID,
  options: [
    { id: fixtureId(6101), code: 'red', value: 'Red', sortOrder: 0 },
    { id: fixtureId(6102), code: 'blue', value: 'Blue', sortOrder: 1 },
  ],
};

export function chosen(attribute: Schema<'EffectiveAttributeDto'>, index: number) {
  const item = attribute.options[index];
  if (item === undefined) throw new Error('no such option');
  return {
    attributeId: attribute.id,
    attributeCode: attribute.code,
    optionId: item.id,
    optionCode: item.code,
    value: item.value,
  };
}

export function serveProfile(server: Server, status: Schema<'SellerProfileDto'>['status'] = 'approved') {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

export function serveCatalog(
  server: Server,
  attributes: Readonly<Record<string, readonly Schema<'EffectiveAttributeDto'>[]>> = {
    [CATEGORY_ID]: [SIZE, COLOR],
    [OTHER_CATEGORY_ID]: [],
  },
) {
  server.use(
    mockApi('get', '/categories', ({ reply }) => reply.ok(TREE), { base: BFF_BASE }),
    mockApi(
      'get',
      '/categories/{categoryId}/attributes',
      ({ params, reply }) => {
        const list = attributes[String(params.categoryId)];
        return list === undefined ? reply.error(404, 'CATEGORY_NOT_FOUND') : reply.ok([...list]);
      },
      { base: BFF_BASE },
    ),
  );
}

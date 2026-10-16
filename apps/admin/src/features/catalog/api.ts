import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// Catalog structure (spec 03 AD-07; design 02 §2.4 `categories.tree`). The whole tree, inactive nodes and own
// attributes included, is read again after every write (spec 03: "Refetch after every write").

export type CategoryNode = Schema<'AdminCategoryNodeDto'>;
export type CategoryAttribute = Schema<'AdminAttributeDto'>;
export type AttributeOption = Schema<'AttributeOptionDto'>;

export const catalogKeys = {
  tree: () => queryKey('admin', 'categories', 'tree'),
};

export function categoryTreeQuery() {
  return queryOptions({
    queryKey: catalogKeys.tree(),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/admin/categories', { signal }))).data,
    staleTime: 0,
  });
}

export async function createCategory(body: Schema<'CreateCategoryDto'>): Promise<CategoryNode> {
  return (await unwrap(browserApi.POST('/api/v1/admin/categories', { body }))).data;
}

export async function updateCategory(
  categoryId: string,
  body: Schema<'UpdateCategoryDto'>,
): Promise<CategoryNode> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/admin/categories/{categoryId}', { params: { path: { categoryId } }, body }),
    )
  ).data;
}

export async function createAttribute(
  categoryId: string,
  body: Schema<'CreateAttributeDto'>,
): Promise<CategoryAttribute> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/categories/{categoryId}/attributes', {
        params: { path: { categoryId } },
        body,
      }),
    )
  ).data;
}

export async function updateAttribute(
  attributeId: string,
  body: Schema<'UpdateAttributeDto'>,
): Promise<CategoryAttribute> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/admin/attributes/{attributeId}', { params: { path: { attributeId } }, body }),
    )
  ).data;
}

export async function deleteAttribute(attributeId: string): Promise<void> {
  await unwrap(
    browserApi.DELETE('/api/v1/admin/attributes/{attributeId}', { params: { path: { attributeId } } }),
  );
}

export async function createOption(
  attributeId: string,
  body: Schema<'CreateOptionDto'>,
): Promise<AttributeOption> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/attributes/{attributeId}/options', {
        params: { path: { attributeId } },
        body,
      }),
    )
  ).data;
}

export async function updateOption(
  optionId: string,
  body: Schema<'UpdateOptionDto'>,
): Promise<AttributeOption> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/admin/options/{optionId}', { params: { path: { optionId } }, body }),
    )
  ).data;
}

export async function deleteOption(optionId: string): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/admin/options/{optionId}', { params: { path: { optionId } } }));
}

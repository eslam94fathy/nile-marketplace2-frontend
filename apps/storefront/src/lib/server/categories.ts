import 'server-only';
import { categoriesTreeQuery, getQueryClient } from '@nile/query';
import { connection } from 'next/server';
import { cache } from 'react';
import { publicServerApi } from './public-api';

/** The category tree changes rarely; spec 01 SF-01 and design 01 §8 revalidate it every 5 minutes. */
export const CATEGORY_TREE_REVALIDATE_SECONDS = 300;

/**
 * The active category tree for this request, from Next's data cache (refreshed every 5 minutes), also placed
 * in the request's query client so client components hydrate from it. Rendering waits for the request
 * (`connection()`): nothing is fetched at build time, when the backend and server settings aren't available.
 */
export const getCategoryTree = cache(async () => {
  await connection();
  return getQueryClient().query(
    categoriesTreeQuery(publicServerApi({ revalidateSeconds: CATEGORY_TREE_REVALIDATE_SECONDS })),
  );
});

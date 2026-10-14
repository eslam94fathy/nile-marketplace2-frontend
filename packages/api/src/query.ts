import type { paths } from './generated/schema';

/** Query of `GET /products` as the generated types describe it (without `attr.*`, see openapi-fix OA-7). */
export type ProductListQuery = NonNullable<paths['/api/v1/products']['get']['parameters']['query']>;

export class InvalidQueryError extends Error {
  override readonly name = 'InvalidQueryError';
}

// Backend spec 06 §4.1 (catalog list): attribute filters need a category, max 5 of them, max 20 values each.
const MAX_ATTRIBUTE_FILTERS = 5;
const MAX_VALUES_PER_ATTRIBUTE = 20;
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Value of an `x[in]` filter: comma-separated, non-empty, no commas inside a value. */
export function inValues(values: readonly string[]): string {
  if (values.length === 0) throw new InvalidQueryError('an [in] filter needs at least one value');
  for (const value of values) {
    if (value === '' || value.includes(',')) {
      throw new InvalidQueryError('[in] filter values must be non-empty and contain no comma');
    }
  }
  return values.join(',');
}

export interface ProductQueryInput extends ProductListQuery {
  /** `attr.<code>[in]` filters: attribute code → option codes (codes from GET /categories/{id}/attributes). */
  attributes?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Builds the `GET /products` query, adding the `attr.<code>[in]` parameters the generated types can't express.
 * Rejects combinations the backend would answer with 400 INVALID_QUERY, so the UI never sends them.
 */
export function productQuery(input: ProductQueryInput): ProductListQuery {
  const { attributes = {}, ...query } = input;
  if ((query.sort === 'relevance' || query.sort === '-relevance') && query.q === undefined) {
    throw new InvalidQueryError('sorting by relevance needs a search text (q)');
  }
  const codes = Object.keys(attributes);
  if (codes.length === 0) return query;
  if (query['categoryId[eq]'] === undefined) {
    throw new InvalidQueryError('attribute filters need categoryId[eq]');
  }
  if (codes.length > MAX_ATTRIBUTE_FILTERS) {
    throw new InvalidQueryError(`at most ${MAX_ATTRIBUTE_FILTERS} attribute filters`);
  }
  const extra: Record<string, string> = {};
  for (const code of codes) {
    const values = attributes[code] ?? [];
    if (!CODE_PATTERN.test(code)) throw new InvalidQueryError(`invalid attribute code "${code}"`);
    if (values.length > MAX_VALUES_PER_ATTRIBUTE) {
      throw new InvalidQueryError(`at most ${MAX_VALUES_PER_ATTRIBUTE} values per attribute`);
    }
    if (values.some((value) => !CODE_PATTERN.test(value))) {
      throw new InvalidQueryError(`invalid option code for attribute "${code}"`);
    }
    extra[`attr.${code}[in]`] = inValues(values);
  }
  // The extra keys are outside the generated type on purpose; the serializer sends every key literally.
  return { ...query, ...extra };
}

/**
 * Query serializer for openapi-fetch: keys are sent literally (`createdAt[gte]`, matching the backend's simple
 * query parser), `undefined`/`null` are skipped, and arrays/objects are refused (use `inValues`).
 */
export function serializeQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.append(key, String(value));
      continue;
    }
    throw new InvalidQueryError(`query parameter "${key}" must be a string, number or boolean`);
  }
  return params.toString();
}

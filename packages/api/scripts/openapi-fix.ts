// Deterministic corrections applied to the pinned OpenAPI snapshot before type generation (architecture §6.3).
// Each rule fixes one finding of docs/frontend/api-inventory.md §9 and THROWS when its target is gone, so a
// backend contract change is noticed instead of silently producing wrong types. The snapshot file itself is
// never edited. Report each fix upstream: once the backend publishes a correct document, delete the rule.

/** The parts of an OpenAPI 3.1 document these rules touch, typed loosely on purpose (plain JSON). */
export interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  format?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  anyOf?: SchemaNode[];
  [keyword: string]: unknown;
}
export interface ParameterNode {
  name?: string;
  in?: string;
  $ref?: string;
  schema?: SchemaNode;
  [keyword: string]: unknown;
}
export interface OperationNode {
  parameters?: ParameterNode[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  [keyword: string]: unknown;
}
export interface OpenApiDocument {
  openapi: string;
  paths?: Record<string, Record<string, OperationNode>>;
  components?: { schemas?: Record<string, SchemaNode>; [key: string]: unknown };
  [key: string]: unknown;
}

export interface FixReport {
  /** OA-1: response properties made `T | null` and required. */
  nullableResponseProperties: number;
  /** OA-1 (requests): `opt nullable` request fields from the backend spec. */
  nullableRequestProperties: number;
  /** OA-5: phantom `__atLeastOneField` properties removed. */
  removedPhantomProperties: number;
  /** OA-4: `idOrSlug` path parameter no longer typed as uuid. */
  fixedIdOrSlug: boolean;
  /** OA-6: request fields required although documented optional (`UpdateGovernorateDto.deliveryFee`, …). */
  requiredRequestProperties: number;
  /** OA-7: literal `attr.{code}[in]` query parameter removed. */
  removedAttrParameter: boolean;
}

/** Request fields the backend spec documents as `opt nullable` (or `nullable`), keyed by schema name. */
export const NULLABLE_REQUEST_FIELDS: Readonly<Record<string, readonly string[]>> = {
  CreateAddressDto: ['floor', 'apartment', 'landmark'], // spec 04 §4.3
  UpdateAddressDto: ['floor', 'apartment', 'landmark'], // spec 04 §4.3
  PickupAddressInput: ['landmark'], // spec 05 §4.1
  CreateVariantDto: ['compareAtPrice'], // spec 06 §4.3
  UpdateVariantDto: ['compareAtPrice'], // spec 06 §4.3
  CreateCategoryDto: ['parentId'], // spec 06 §4.2
  UpdateGovernorateDto: ['deliveryFee'], // spec 11 §4.3 (also required, OA-6)
  // Release 2 (backend DTOs with `@Nullable()` at ecbcd19)
  AddProductImageDto: ['variantId', 'altText'], // spec 06 §8.4
  UpdateProductImageDto: ['variantId', 'altText'], // spec 06 §8.4
  SetCategoryImageDto: ['altText'], // spec 06 §8.4
  CreateReviewDto: ['title', 'body'], // spec 17 §4.2
  EditReviewDto: ['title', 'body'], // spec 17 §4.2
  AssignTicketDto: ['adminUserId'], // spec 16 §4.2 (also required, OA-6)
  RegisterPushSubscriptionDto: ['expirationTime'], // spec 13 NO-23
  SellerCreateCouponDto: ['maxDiscount', 'globalLimit'], // spec 19 §4
  AdminCreateCouponDto: ['maxDiscount', 'globalLimit'], // spec 19 §4
  SellerUpdateCouponDto: ['maxDiscount', 'scopeCategoryId', 'globalLimit'], // spec 19 §4
  AdminUpdateCouponDto: ['maxDiscount', 'scopeCategoryId', 'globalLimit', 'scopeSellerId'], // spec 19 §4
};

/** Request fields the backend requires (a value or `null`) but documents as optional, keyed by schema name. */
export const REQUIRED_REQUEST_FIELDS: Readonly<Record<string, readonly string[]>> = {
  UpdateGovernorateDto: ['deliveryFee'], // spec 11 §4.3
  AssignTicketDto: ['adminUserId'], // spec 16 §4.2: an admin, or null to unassign
};

/**
 * Response fields that are left out (not `null`) when empty, so the OA-1 rule must keep them optional.
 * Found by the contract suite (T-B7) and verified in the backend code.
 */
export const OPTIONAL_RESPONSE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  AdminShipmentDto: ['history'], // `toAdminShipmentDto(view, false)`: lists leave it out, detail includes it
};

const PHANTOM_PROPERTY = '__atLeastOneField';
const PRODUCT_DETAIL_PATH = '/api/v1/products/{idOrSlug}';
const PRODUCT_LIST_PATH = '/api/v1/products';
const ATTR_PARAMETER = 'attr.{code}[in]';
const ERROR_ENVELOPE = 'ErrorEnvelope';
const SCHEMA_REF_PREFIX = '#/components/schemas/';
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace']);

export class OpenApiFixError extends Error {
  override readonly name = 'OpenApiFixError';
}

/** Every schema name referenced anywhere inside `node`. */
function collectRefs(node: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into);
  } else if (typeof node === 'object' && node !== null) {
    const ref = (node as { $ref?: unknown }).$ref;
    if (typeof ref === 'string' && ref.startsWith(SCHEMA_REF_PREFIX))
      into.add(ref.slice(SCHEMA_REF_PREFIX.length));
    for (const value of Object.values(node)) collectRefs(value, into);
  }
  return into;
}

/** Transitive closure of schema references, starting from `seeds`. */
function closure(schemas: Record<string, SchemaNode>, seeds: Set<string>): Set<string> {
  const seen = new Set<string>();
  const queue = [...seeds];
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (seen.has(name)) continue;
    seen.add(name);
    for (const next of collectRefs(schemas[name], new Set())) queue.push(next);
  }
  return seen;
}

function operations(document: OpenApiDocument): OperationNode[] {
  const result: OperationNode[] = [];
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [key, value] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(key)) result.push(value);
    }
  }
  return result;
}

function isAlreadyNullable(schema: SchemaNode): boolean {
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  return schema.anyOf?.some((option) => option.type === 'null') ?? false;
}

function nullable(schema: SchemaNode): SchemaNode {
  return isAlreadyNullable(schema) ? schema : { anyOf: [schema, { type: 'null' }] };
}

function objectSchema(
  schemas: Record<string, SchemaNode>,
  name: string,
): SchemaNode & { properties: Record<string, SchemaNode> } {
  const schema = schemas[name];
  if (schema?.properties === undefined) {
    throw new OpenApiFixError(`schema ${name} is missing or has no properties`);
  }
  return schema as SchemaNode & { properties: Record<string, SchemaNode> };
}

function findGetOperation(document: OpenApiDocument, path: string): OperationNode {
  const operation = document.paths?.[path]?.get;
  if (!operation) throw new OpenApiFixError(`GET ${path} is missing`);
  return operation;
}

export function applyFixes(input: OpenApiDocument): { document: OpenApiDocument; report: FixReport } {
  const document = structuredClone(input);
  const schemas = document.components?.schemas ?? {};
  const report: FixReport = {
    nullableResponseProperties: 0,
    nullableRequestProperties: 0,
    removedPhantomProperties: 0,
    fixedIdOrSlug: false,
    requiredRequestProperties: 0,
    removedAttrParameter: false,
  };

  // Which schemas are reachable from request bodies and from success responses.
  const requestSeeds = new Set<string>();
  const responseSeeds = new Set<string>();
  for (const operation of operations(document)) {
    collectRefs(operation.requestBody, requestSeeds);
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (status !== 'default') collectRefs(response, responseSeeds);
    }
  }
  const requestSchemas = closure(schemas, requestSeeds);
  const responseSchemas = closure(schemas, responseSeeds);
  responseSchemas.delete(ERROR_ENVELOPE);
  const shared = [...requestSchemas].filter((name) => responseSchemas.has(name));
  if (shared.length > 0) {
    // The OA-1 rule below would make request fields nullable too; decide explicitly before generating.
    throw new OpenApiFixError(`schemas used by both requests and responses: ${shared.sort().join(', ')}`);
  }

  // OA-5: phantom property of PATCH DTOs (sending it is rejected by the backend's strict whitelist).
  for (const schema of Object.values(schemas)) {
    const properties = schema.properties;
    if (properties === undefined || !(PHANTOM_PROPERTY in properties)) continue;
    schema.properties = Object.fromEntries(
      Object.entries(properties).filter(([key]) => key !== PHANTOM_PROPERTY),
    );
    const required = (schema.required ?? []).filter((field) => field !== PHANTOM_PROPERTY);
    if (required.length > 0) schema.required = required;
    else delete schema.required;
    report.removedPhantomProperties += 1;
  }

  // OA-1: response DTOs always emit every key and use null for "no value", but document such keys as
  // optional. Make them required and `T | null`, except the few fields that are really left out.
  // [VERIFIED by the contract suite, T-B7]
  for (const [name, fields] of Object.entries(OPTIONAL_RESPONSE_FIELDS)) {
    const schema = objectSchema(schemas, name);
    for (const field of fields) {
      if (!(field in schema.properties)) throw new OpenApiFixError(`${name}.${field} is missing`);
      if (schema.required?.includes(field)) throw new OpenApiFixError(`${name}.${field} is now required`);
    }
  }
  for (const name of responseSchemas) {
    const schema = schemas[name];
    const properties = schema?.properties;
    if (schema === undefined || properties === undefined) continue;
    const required = new Set(schema.required ?? []);
    const optional = new Set(OPTIONAL_RESPONSE_FIELDS[name] ?? []);
    for (const [field, property] of Object.entries(properties)) {
      if (required.has(field) || optional.has(field)) continue;
      properties[field] = nullable(property);
      required.add(field);
      report.nullableResponseProperties += 1;
    }
    schema.required = [...required];
  }

  // OA-1 (requests): fields the spec allows to be sent as null; they stay optional unless stated.
  for (const [name, fields] of Object.entries(NULLABLE_REQUEST_FIELDS)) {
    const schema = objectSchema(schemas, name);
    for (const field of fields) {
      const property = schema.properties[field];
      if (!property) throw new OpenApiFixError(`${name}.${field} is missing`);
      schema.properties[field] = nullable(property);
      report.nullableRequestProperties += 1;
    }
  }

  // OA-6: fields the backend requires (a value or null) although the document marks them optional.
  for (const [name, fields] of Object.entries(REQUIRED_REQUEST_FIELDS)) {
    const schema = objectSchema(schemas, name);
    for (const field of fields) {
      if (!(field in schema.properties)) throw new OpenApiFixError(`${name}.${field} is missing`);
      schema.required = [...new Set([...(schema.required ?? []), field])];
      report.requiredRequestProperties += 1;
    }
  }

  // OA-4: the product path accepts a slug as well as a uuid.
  const idOrSlug = findGetOperation(document, PRODUCT_DETAIL_PATH).parameters?.find(
    (parameter) => parameter.name === 'idOrSlug',
  );
  if (idOrSlug?.schema === undefined) {
    throw new OpenApiFixError(`idOrSlug parameter of ${PRODUCT_DETAIL_PATH} is missing`);
  }
  delete idOrSlug.schema.format;
  report.fixedIdOrSlug = true;

  // OA-7: `attr.{code}[in]` is a family of parameters, not one literal name; @nile/api builds them by hand.
  const listOperation = findGetOperation(document, PRODUCT_LIST_PATH);
  const parameters = listOperation.parameters ?? [];
  const kept = parameters.filter((parameter) => parameter.name !== ATTR_PARAMETER);
  if (kept.length === parameters.length) {
    throw new OpenApiFixError(`${ATTR_PARAMETER} parameter of ${PRODUCT_LIST_PATH} is missing`);
  }
  listOperation.parameters = kept;
  report.removedAttrParameter = true;

  return { document, report };
}

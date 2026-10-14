import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  NULLABLE_REQUEST_FIELDS,
  OpenApiFixError,
  type OpenApiDocument,
  type SchemaNode,
} from './openapi-fix.ts';
import { SNAPSHOT_FILE } from './paths.ts';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = { 'application/json': {} };
const body = (schema: unknown) => ({ content: { 'application/json': { schema } } });

/** Smallest document that satisfies every rule; tests then break one thing at a time. */
function fixture(): OpenApiDocument {
  const nullableRequests: Record<string, SchemaNode> = {};
  for (const [name, fields] of Object.entries(NULLABLE_REQUEST_FIELDS)) {
    nullableRequests[name] = {
      type: 'object',
      properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'fixture', version: '1' },
    paths: {
      '/api/v1/products': {
        get: {
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'attr.{code}[in]', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'ok', ...body(ref('ProductDto')) } },
        },
      },
      '/api/v1/products/{idOrSlug}': {
        get: {
          parameters: [
            { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: { description: 'ok', ...body(ref('ProductDto')) },
            default: { description: 'error', ...body(ref('ErrorEnvelope')) },
          },
        },
      },
      '/api/v1/things': {
        patch: {
          requestBody: { required: true, content: { 'application/json': { schema: ref('PatchThingDto') } } },
          responses: { 200: { description: 'ok', content: json } },
        },
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { anyOf: Object.keys(NULLABLE_REQUEST_FIELDS).map((n) => ref(n)) },
              },
            },
          },
          responses: { 204: { description: 'none' } },
        },
      },
    },
    components: {
      schemas: {
        ProductDto: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            compareAtPrice: { type: 'string' },
            seller: ref('SellerRefDto'),
            meta: { type: ['string', 'null'] },
          },
        },
        SellerRefDto: { type: 'object', properties: { name: { type: 'string' } } },
        ErrorEnvelope: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'object' }, details: { type: 'array' } },
        },
        PatchThingDto: {
          type: 'object',
          required: ['__atLeastOneField'],
          properties: { name: { type: 'string' }, __atLeastOneField: {} },
        },
        ...nullableRequests,
      },
    },
  };
}

function schemaOf(doc: OpenApiDocument, name: string): SchemaNode {
  const schema = doc.components?.schemas?.[name];
  if (!schema) throw new Error('fixture has no ' + name);
  return schema;
}

describe('applyFixes', () => {
  it('does not mutate its input', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    applyFixes(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  describe('OA-1 responses', () => {
    it('makes optional response fields required and nullable, also in referenced schemas', () => {
      const { document } = applyFixes(fixture());
      const product = schemaOf(document, 'ProductDto');
      expect(product.required).toEqual(expect.arrayContaining(['id', 'compareAtPrice', 'seller', 'meta']));
      expect(product.properties?.compareAtPrice).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
      expect(product.properties?.seller).toEqual({ anyOf: [ref('SellerRefDto'), { type: 'null' }] });
      expect(schemaOf(document, 'SellerRefDto').required).toEqual(['name']);
    });

    it('leaves fields that are already nullable as they are', () => {
      const { document } = applyFixes(fixture());
      expect(schemaOf(document, 'ProductDto').properties?.meta).toEqual({ type: ['string', 'null'] });
    });

    it('leaves the error envelope alone (details really is optional)', () => {
      const { document } = applyFixes(fixture());
      expect(schemaOf(document, 'ErrorEnvelope')).toEqual(schemaOf(fixture(), 'ErrorEnvelope'));
    });

    it('refuses a schema shared by requests and responses', () => {
      const doc = fixture();
      const thing = schemaOf(doc, 'PatchThingDto');
      thing.properties = { ...thing.properties, product: ref('ProductDto') };
      expect(() => applyFixes(doc)).toThrow(/used by both requests and responses: ProductDto, SellerRefDto/);
    });
  });

  describe('OA-1 requests', () => {
    it('makes the spec-listed request fields nullable but keeps them optional', () => {
      const { document, report } = applyFixes(fixture());
      const address = schemaOf(document, 'CreateAddressDto');
      expect(address.properties?.floor).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
      expect(address.required).toBeUndefined();
      expect(report.nullableRequestProperties).toBe(Object.values(NULLABLE_REQUEST_FIELDS).flat().length);
    });

    it('throws when a listed field disappears', () => {
      const doc = fixture();
      delete schemaOf(doc, 'CreateVariantDto').properties?.compareAtPrice;
      expect(() => applyFixes(doc)).toThrow(
        new OpenApiFixError('CreateVariantDto.compareAtPrice is missing'),
      );
    });
  });

  it('OA-5 removes the phantom property and its required entry', () => {
    const { document, report } = applyFixes(fixture());
    const patch = schemaOf(document, 'PatchThingDto');
    expect(patch.properties).not.toHaveProperty('__atLeastOneField');
    expect(patch.required).toBeUndefined();
    expect(report.removedPhantomProperties).toBe(1);
  });

  it('OA-6 makes UpdateGovernorateDto.deliveryFee required and nullable', () => {
    const governorate = schemaOf(applyFixes(fixture()).document, 'UpdateGovernorateDto');
    expect(governorate.required).toEqual(['deliveryFee']);
    expect(governorate.properties?.deliveryFee).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  });

  it('OA-4 drops the uuid format of idOrSlug', () => {
    const { document } = applyFixes(fixture());
    expect(document.paths?.['/api/v1/products/{idOrSlug}']?.get?.parameters?.[0]).toMatchObject({
      name: 'idOrSlug',
      schema: { type: 'string' },
    });
    expect(JSON.stringify(document.paths?.['/api/v1/products/{idOrSlug}'])).not.toContain('uuid');
  });

  it('OA-7 removes the literal attr parameter and keeps the others', () => {
    const { document } = applyFixes(fixture());
    expect(document.paths?.['/api/v1/products']?.get?.parameters).toEqual([
      { name: 'q', in: 'query', schema: { type: 'string' } },
    ]);
  });

  it.each([
    [
      'the idOrSlug parameter',
      (doc: OpenApiDocument) => doc.paths?.['/api/v1/products/{idOrSlug}']?.get?.parameters?.pop(),
    ],
    ['the attr parameter', (doc: OpenApiDocument) => doc.paths?.['/api/v1/products']?.get?.parameters?.pop()],
    ['the product list path', (doc: OpenApiDocument) => delete doc.paths?.['/api/v1/products']],
    ['UpdateGovernorateDto', (doc: OpenApiDocument) => delete doc.components?.schemas?.UpdateGovernorateDto],
  ])('throws when %s is gone', (_label, breakIt) => {
    const doc = fixture();
    breakIt(doc);
    expect(() => applyFixes(doc)).toThrow(OpenApiFixError);
  });
});

describe('the pinned snapshot', () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as OpenApiDocument;
  const { document, report } = applyFixes(snapshot);

  it('has all 123 operations', () => {
    const count = Object.values(document.paths ?? {}).reduce((n, item) => n + Object.keys(item).length, 0);
    expect(count).toBe(123);
  });

  it('applies every rule with the expected reach', () => {
    expect(report).toEqual({
      nullableResponseProperties: 84,
      nullableRequestProperties: 11,
      removedPhantomProperties: 10,
      fixedIdOrSlug: true,
      fixedGovernorateFee: true,
      removedAttrParameter: true,
    });
  });

  it.each([
    ['GovernorateDto', 'deliveryFee'],
    ['CartDto', 'id'],
    ['CartItemDto', 'issue'],
    ['AddressDto', 'floor'],
    ['OrderDetailDto', 'paymentExpiresAt'],
    ['CheckoutResultDto', 'kashier'],
    ['SellerVariantDto', 'compareAtPrice'],
  ])('%s.%s is required and nullable', (name, field) => {
    const schema = schemaOf(document, name);
    expect(schema.required).toContain(field);
    expect(JSON.stringify(schema.properties?.[field])).toContain('"null"');
  });
});

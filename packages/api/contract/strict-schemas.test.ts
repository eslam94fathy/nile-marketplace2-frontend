// T-B7: proves the contract checker fails on broken responses and names the endpoint and the field.
// Runs in the normal unit suite (no backend).
import { describe, expect, it } from 'vitest';
import type { OpenApiDocument } from '../scripts/openapi-fix.ts';
import {
  ContractSetupError,
  ContractViolation,
  createContract,
  formatIssuePath,
  strictDocument,
  type CheckedResponse,
} from './strict-schemas';

const contract = createContract();

const GOVERNORATE = {
  id: '01900000-0000-7000-8000-000000000001',
  code: 'EG-C',
  name: 'Cairo',
  deliveryFee: '50.00',
  isDeliverable: true,
};

const governorates = (data: unknown, status = 200): CheckedResponse => ({
  method: 'GET',
  path: '/api/v1/governorates',
  status,
  body: { success: true, data },
});

function violation(response: CheckedResponse, template: string): string {
  try {
    contract.assertResponse(response, template);
  } catch (error) {
    if (error instanceof ContractViolation) return error.message;
    throw error;
  }
  throw new Error('expected a contract violation');
}

describe('contract checker', () => {
  it('accepts a response that matches the corrected snapshot, including OA-1 nulls', () => {
    expect(() => {
      contract.assertResponse(
        governorates([GOVERNORATE, { ...GOVERNORATE, deliveryFee: null }]),
        '/api/v1/governorates',
      );
    }).not.toThrow();
  });

  it('rejects null in a non-nullable field, naming endpoint and field', () => {
    const message = violation(governorates([{ ...GOVERNORATE, name: null }]), '/api/v1/governorates');
    expect(message).toContain('GET /api/v1/governorates → 200 does not match /api/v1/governorates');
    expect(message).toContain('data[0].name:');
  });

  it('rejects a missing property, even a nullable one (OA-1: present as null, never absent)', () => {
    const withoutFee: Partial<typeof GOVERNORATE> = { ...GOVERNORATE };
    delete withoutFee.deliveryFee;
    expect(violation(governorates([withoutFee]), '/api/v1/governorates')).toContain('data[0].deliveryFee:');
  });

  it('rejects an undocumented property', () => {
    expect(violation(governorates([{ ...GOVERNORATE, colour: 'blue' }]), '/api/v1/governorates')).toMatch(
      /data\[0\]: .*colour/,
    );
  });

  it('rejects a wrong format (money pattern) and a wrong uuid', () => {
    const message = violation(
      governorates([{ ...GOVERNORATE, id: 'not-a-uuid', deliveryFee: '50' + '.' + '001' }]),
      '/api/v1/governorates',
    );
    expect(message).toContain('data[0].id:');
    expect(message).toContain('data[0].deliveryFee:');
  });

  it('rejects an unknown enum value', () => {
    const document: OpenApiDocument = {
      openapi: '3.1.0',
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['status'],
                      properties: { status: { type: 'string', enum: ['active', 'inactive'] } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const small = createContract(strictDocument(document));
    const response = { method: 'GET', path: '/things', status: 200, body: { status: 'archived' } };
    expect(() => {
      small.assertResponse(response, '/things');
    }).toThrow(/status:/);
    expect(() => {
      small.assertResponse({ ...response, body: { status: 'active' } }, '/things');
    }).not.toThrow();
  });

  it('checks error answers against the error envelope', () => {
    const notFound = (body: unknown): CheckedResponse => ({
      method: 'GET',
      path: '/api/v1/products/x',
      status: 404,
      body,
    });
    const valid = {
      success: false,
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' },
      correlationId: GOVERNORATE.id,
    };
    expect(() => {
      contract.assertResponse(notFound(valid), '/api/v1/products/{idOrSlug}');
    }).not.toThrow();
    expect(
      violation(notFound({ ...valid, correlationId: undefined }), '/api/v1/products/{idOrSlug}'),
    ).toContain('correlationId:');
  });

  it('refuses an endpoint that is not in the snapshot', () => {
    expect(() => {
      contract.assertResponse(governorates([]), '/api/v1/nowhere');
    }).toThrow(ContractSetupError);
  });
});

describe('strictDocument', () => {
  it('closes object schemas and leaves free-form objects open', () => {
    const document: OpenApiDocument = {
      openapi: '3.1.0',
      components: {
        schemas: {
          Closed: { type: 'object', properties: { a: { type: 'string' } } },
          Open: { type: 'object' },
        },
      },
    };
    const schemas = strictDocument(document).components?.schemas;
    expect(schemas?.Closed?.additionalProperties).toBe(false);
    expect(schemas?.Open).not.toHaveProperty('additionalProperties');
  });

  it('throws on an allOf of several members', () => {
    const document: OpenApiDocument = {
      openapi: '3.1.0',
      components: { schemas: { Mixed: { allOf: [{ $ref: '#/a' }, { $ref: '#/b' }] } } },
    };
    expect(() => strictDocument(document)).toThrow(ContractSetupError);
  });
});

describe('formatIssuePath', () => {
  it('formats nested paths', () => {
    expect(formatIssuePath(['data', 0, 'items', 2, 'price'])).toBe('data[0].items[2].price');
    expect(formatIssuePath([])).toBe('(body)');
  });
});

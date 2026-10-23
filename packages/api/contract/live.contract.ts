// Contract suite (T-B7): real backend responses parsed with strict schemas from the corrected snapshot.
// Covers every public GET, every parameter-free GET of each role, and the error envelope for 400/401/403/404.
// Run: `npm run test:contract` against a backend at the pinned commit (design 01 §12.3, R-16).
import { createAccounts, e2eEnv, type Account, type BackendResponse } from '@nile/test-utils/e2e';
import { beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/error-codes';
import { createContract, loadCorrectedDocument } from './strict-schemas';

const API_PREFIX = '/api/v1';
const env = e2eEnv();
const accounts = createAccounts(env);
const contract = createContract();
const document = loadCorrectedDocument();
const { backend } = accounts;

/** Not called by the web apps (api-inventory §6 "Infrastructure"); `/health/ready` gates the CI job instead. */
const EXCLUDED_PUBLIC = new Set(['/health/live', '/health/ready']);

type Operation = NonNullable<NonNullable<typeof document.paths>[string]>[string];

function getOperations(): [string, Operation][] {
  return Object.entries(document.paths ?? {}).flatMap(([path, operations]) =>
    operations.get ? [[path, operations.get] as [string, Operation]] : [],
  );
}

const isPublic = (operation: Operation): boolean =>
  !Array.isArray(operation.security) || operation.security.length === 0;

function hasRequiredQuery(operation: Operation): boolean {
  return (operation.parameters ?? []).some(
    (parameter) => parameter.in === 'query' && parameter.required === true,
  );
}

type Role = Account['role'];

/** Role of an authenticated path, by its prefix (backend route groups). */
function roleOf(path: string): Role {
  if (path.startsWith(`${API_PREFIX}/admin/`)) return 'admin';
  if (path.startsWith(`${API_PREFIX}/agent/`)) return 'delivery_agent';
  if (path.startsWith(`${API_PREFIX}/seller/`)) return 'seller';
  return 'customer';
}

/** Parameter-free authenticated GETs per role: each one is called and checked. */
function authenticatedGets(role: Role): string[] {
  return getOperations()
    .filter(
      ([path, operation]) => !isPublic(operation) && !path.includes('{') && !hasRequiredQuery(operation),
    )
    .map(([path]) => path)
    .filter((path) => roleOf(path) === role)
    .sort();
}

function check(response: BackendResponse, template: string): void {
  contract.assertResponse(response, template);
}

describe('public GETs', () => {
  let categoryId = '';
  let product: { id: string; slug: string } | undefined;

  const PUBLIC_CHECKS: Record<string, () => Promise<void>> = {
    '/api/v1/categories': async () => {
      check(await backend.request('GET', '/api/v1/categories'), '/api/v1/categories');
    },
    '/api/v1/categories/{categoryId}/attributes': async () => {
      const template = '/api/v1/categories/{categoryId}/attributes';
      check(await backend.request('GET', `/api/v1/categories/${categoryId}/attributes`), template);
    },
    '/api/v1/governorates': async () => {
      check(await backend.request('GET', '/api/v1/governorates'), '/api/v1/governorates');
    },
    '/api/v1/products': async () => {
      // A small page, so `meta.nextCursor`/`hasMore` are exercised when the seed has more products.
      check(await backend.request('GET', '/api/v1/products', { query: { limit: '2' } }), '/api/v1/products');
    },
    '/api/v1/products/{idOrSlug}': async () => {
      if (!product) throw new Error('No public product: run the backend seed (npm run seed:dev)');
      for (const idOrSlug of [product.id, product.slug]) {
        check(await backend.request('GET', `/api/v1/products/${idOrSlug}`), '/api/v1/products/{idOrSlug}');
      }
    },
  };

  beforeAll(async () => {
    const tree = await backend.request('GET', '/api/v1/categories');
    const roots = (tree.body as { data: { id: string; children: { id: string }[] }[] }).data;
    const first = roots[0];
    if (!first) throw new Error('No categories: run the backend seed (npm run seed:dev)');
    // A child category inherits its parents' attributes: the deepest first branch exercises the most fields.
    categoryId = first.children[0]?.id ?? first.id;
    const list = await backend.request('GET', '/api/v1/products', { query: { limit: '1' } });
    product = (list.body as { data: { id: string; slug: string }[] }).data[0];
  });

  it('checks every public GET of the snapshot', () => {
    const documented = getOperations()
      .filter(([path, operation]) => isPublic(operation) && !EXCLUDED_PUBLIC.has(path))
      .map(([path]) => path)
      .sort();
    expect(Object.keys(PUBLIC_CHECKS).sort()).toEqual(documented);
  });

  for (const [template, run] of Object.entries(PUBLIC_CHECKS)) {
    it(`GET ${template}`, run);
  }
});

// One customer for the whole suite: strict-auth limits count per IP too (registration + verification).
let customerAccount: Promise<Account> | undefined;
const sharedCustomer = (): Promise<Account> => (customerAccount ??= accounts.customer());

const ROLE_ACCOUNTS: Record<Role, () => Promise<Account>> = {
  customer: sharedCustomer,
  seller: () => accounts.seller({ approved: true }),
  admin: () => accounts.admin(),
  delivery_agent: () => accounts.agent(),
};

for (const role of Object.keys(ROLE_ACCOUNTS) as Role[]) {
  describe(`authenticated GETs: ${role}`, () => {
    const paths = authenticatedGets(role);
    let account: Account;

    beforeAll(async () => {
      account = await ROLE_ACCOUNTS[role]();
      expect(account.role).toBe(role);
    });

    it('has at least one GET to check', () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    it.each(paths)('GET %s', async (path) => {
      const response = await backend.request('GET', path, { token: account.accessToken });
      expect(response.status, `GET ${path}`).toBe(200);
      check(response, path);
    });
  });
}

describe('error envelope', () => {
  const NOT_FOUND_PRODUCT = '01900000-0000-7000-8000-000000000000';
  let customer: Account;

  beforeAll(async () => {
    customer = await sharedCustomer();
  });

  function checkError(response: BackendResponse, template: string, status: number, code: string): void {
    expect(response.status, `${response.method} ${response.path}`).toBe(status);
    check(response, template);
    const actual = (response.body as { error: { code: string } }).error.code;
    expect(actual).toBe(code);
    expect(ERROR_CODES, `${actual} is missing from src/error-codes.ts`).toContain(actual);
  }

  it('400 for an invalid query', async () => {
    const response = await backend.request('GET', '/api/v1/products', { query: { limit: '0' } });
    checkError(response, '/api/v1/products', 400, 'INVALID_QUERY');
  });

  it('401 without a token', async () => {
    checkError(await backend.request('GET', '/api/v1/me'), '/api/v1/me', 401, 'UNAUTHENTICATED');
  });

  it("403 for another role's endpoint", async () => {
    const response = await backend.request('GET', '/api/v1/admin/admins', { token: customer.accessToken });
    checkError(response, '/api/v1/admin/admins', 403, 'FORBIDDEN');
  });

  it('404 for a missing resource', async () => {
    const response = await backend.request('GET', `/api/v1/products/${NOT_FOUND_PRODUCT}`);
    checkError(response, '/api/v1/products/{idOrSlug}', 404, 'PRODUCT_NOT_FOUND');
  });
});

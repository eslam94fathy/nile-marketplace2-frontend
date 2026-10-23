// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { errorBody, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CategoriesView } from './categories-view';

const server = setupMswServer();

type Node = Schema<'AdminCategoryNodeDto'>;

const option = (id: number, value: string, sortOrder = 0) => ({
  id: fixtureId(id),
  code: value.toLowerCase(),
  value,
  sortOrder,
});

const SIZE = {
  id: fixtureId(5001),
  code: 'size',
  name: 'Size',
  sortOrder: 0,
  options: [option(6001, 'S'), option(6002, 'M', 1)],
};
const MATERIAL = {
  id: fixtureId(5002),
  code: 'material',
  name: 'Material',
  sortOrder: 0,
  options: [option(6101, 'Cotton')],
};

const leaf = (overrides: Partial<Node> = {}): Node => ({
  id: fixtureId(3),
  parentId: fixtureId(2),
  name: 'T-shirts',
  slug: 't-shirts',
  depth: 3,
  sortOrder: 0,
  isActive: true,
  attributes: [],
  children: [],
  ...overrides,
});

function tree(
  overrides: { root?: Partial<Node>; middle?: Partial<Node>; leaf?: Partial<Node> } = {},
): Node[] {
  return [
    {
      id: fixtureId(1),
      parentId: null,
      name: 'Fashion',
      slug: 'fashion',
      depth: 1,
      sortOrder: 0,
      isActive: true,
      attributes: [MATERIAL],
      children: [
        {
          id: fixtureId(2),
          parentId: fixtureId(1),
          name: 'Men',
          slug: 'men',
          depth: 2,
          sortOrder: 0,
          isActive: true,
          attributes: [SIZE],
          children: [leaf(overrides.leaf)],
          ...overrides.middle,
        },
      ],
      ...overrides.root,
    },
  ];
}

/** `GET /admin/categories`: answers `state.tree`; counts reads (every write is followed by one). */
function serveTree(initial: Node[]) {
  const state = { tree: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/categories',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.tree);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

/**
 * Any catalog write refused with `code`; records the bodies. Plain MSW (the typed `mockApi` takes one known
 * path per call), with the backend's error envelope.
 */
function failWith(method: 'post' | 'patch' | 'delete', path: string, status: number, code: ErrorCode) {
  const bodies: unknown[] = [];
  const url = `${BFF_BASE}${path.replace(/\{(\w+)\}/g, ':$1')}`;
  server.use(
    http[method](url, async ({ request }) => {
      const text = await request.text();
      bodies.push(text === '' ? undefined : JSON.parse(text));
      return HttpResponse.json(errorBody(code), { status });
    }),
  );
  return bodies;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/catalog/categories');
});

const renderView = (selectedId: string | null) =>
  renderWithProviders(
    <>
      <CategoriesView initialSelectedId={selectedId} />
      <Toaster />
    </>,
  );

const currentUrl = () => `${window.location.pathname}${window.location.search}`;

type View = ReturnType<typeof renderView>;

const panelHeading = (name: string) => screen.findByRole('heading', { level: 2, name }, { timeout: 5000 });

describe('category tree (spec 03 AD-07)', { timeout: 20_000 }, () => {
  it('the selected branch is open; selecting a node puts it in the URL; inactive nodes are marked', async () => {
    serveTree(tree({ leaf: { isActive: false } }));
    const view = renderView(fixtureId(3));
    const nav = await screen.findByRole('navigation', { name: 'Category tree' }, { timeout: 5000 });
    expect(
      within(nav)
        .getByRole('button', { name: /^T-shirts/ })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(within(nav).getByText('Inactive')).toBeDefined();
    await view.user.click(within(nav).getByRole('button', { name: 'Hide subcategories of Men' }));
    expect(within(nav).queryByRole('button', { name: /^T-shirts/ })).toBeNull();
    await view.user.click(within(nav).getByRole('button', { name: 'Men' }));
    expect(currentUrl()).toBe(`/catalog/categories?category=${fixtureId(2)}`);
  });

  // Regression (reported 2026-10-15): clicking a category left the panel unchanged.
  it('clicking a category opens its panel at once, with nothing selected before', async () => {
    serveTree(tree());
    const view = renderView(null);
    const nav = await screen.findByRole('navigation', { name: 'Category tree' }, { timeout: 5000 });
    expect(screen.getByText('Choose a category to see and edit it.')).toBeDefined();
    await view.user.click(within(nav).getByRole('button', { name: 'Fashion' }));
    expect(await panelHeading('Fashion')).toBeDefined();
    expect(within(nav).getByRole('button', { name: 'Fashion' }).getAttribute('aria-current')).toBe('true');
    await view.user.click(within(nav).getByRole('button', { name: 'Show subcategories of Fashion' }));
    await view.user.click(within(nav).getByRole('button', { name: 'Men' }));
    expect(await panelHeading('Men')).toBeDefined();
    expect(currentUrl()).toBe(`/catalog/categories?category=${fixtureId(2)}`);
  });

  it('nothing selected: a prompt; an unknown id: "no longer exists"', async () => {
    serveTree(tree());
    const view = renderView(null);
    expect(
      await screen.findByText('Choose a category to see and edit it.', {}, { timeout: 5000 }),
    ).toBeDefined();
    view.unmount();
    renderView(fixtureId(99));
    expect(await screen.findByText('This category no longer exists.', {}, { timeout: 5000 })).toBeDefined();
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/admin/categories', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderView(null);
    expect(
      await screen.findByText("The categories couldn't be loaded.", {}, { timeout: 5000 }),
    ).toBeDefined();
  });
});

describe('category panel (spec 03 AD-07)', { timeout: 20_000 }, () => {
  it('depth 3: no "Add subcategory"; inherited attributes and the effective count', async () => {
    serveTree(tree());
    renderView(fixtureId(3));
    await panelHeading('T-shirts');
    expect(screen.queryByRole('button', { name: 'Add subcategory' })).toBeNull();
    expect(screen.getByText('Effective attributes: 2 of 5')).toBeDefined();
    expect(screen.getByText('Material')).toBeDefined();
    expect(screen.getByText(/from Fashion/)).toBeDefined();
    expect(screen.getByText(/from Men · S, M/)).toBeDefined();
    expect(screen.getByText('No attributes on this category.')).toBeDefined();
  });

  it('a child of an inactive parent: activation disabled with the reason; adding subcategories needs an active category', async () => {
    serveTree(tree({ middle: { isActive: false }, leaf: { isActive: false } }));
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    expect(screen.getByRole('switch', { name: 'Active' })).toHaveProperty('disabled', true);
    expect(screen.getAllByText('Activate the parent category first.').length).toBeGreaterThan(0);
    view.unmount();
    renderView(fixtureId(2));
    await panelHeading('Men');
    expect(screen.getByRole('button', { name: 'Add subcategory' })).toHaveProperty('disabled', true);
  });

  it('details: changed fields only, then the tree is read again; the slug warning', async () => {
    const state = serveTree(tree());
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'patch',
        '/admin/categories/{categoryId}',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok(leaf({ name: 'Tees' }));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    const name = screen.getByRole('textbox', { name: /^Name/ });
    await view.user.clear(name);
    await view.user.type(name, 'Tees');
    await view.user.type(screen.getByRole('textbox', { name: /^Slug/ }), '-x');
    expect(screen.getByText("Changing the slug changes the category's web address.")).toBeDefined();
    const before = state.reads;
    await view.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Category saved.')).toBeDefined();
    expect(bodies).toEqual([{ name: 'Tees', slug: 't-shirts-x' }]);
    expect(state.reads).toBeGreaterThan(before);
  });

  it.each([
    ['CATEGORY_NAME_TAKEN', 'Another category at this level already has this name.'],
    ['CATEGORY_SLUG_TAKEN', 'This slug is taken. Enter another one.'],
  ] as const)('details: %s on its field', async (code, message) => {
    serveTree(tree());
    failWith('patch', '/admin/categories/{categoryId}', 409, code);
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    await view.user.type(screen.getByRole('textbox', { name: /^Name/ }), ' 2');
    await view.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(message)).toBeDefined();
  });

  it('deactivate: asked first; CATEGORY_IN_USE explained', async () => {
    serveTree(tree());
    const bodies = failWith('patch', '/admin/categories/{categoryId}', 409, 'CATEGORY_IN_USE');
    const view = renderView(fixtureId(2));
    await panelHeading('Men');
    await view.user.click(screen.getByRole('switch', { name: 'Active' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate category' });
    expect(within(dialog).getByText('Deactivate Men? Hidden from shoppers and sellers.')).toBeDefined();
    expect(bodies).toEqual([]);
    await view.user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(
      await screen.findByText('Deactivate its subcategories first, and make sure no products use it.'),
    ).toBeDefined();
    expect(bodies).toEqual([{ isActive: false }]);
  });

  it('a removed category (CATEGORY_NOT_FOUND): the tree is reloaded and it says so', async () => {
    const state = serveTree(tree());
    failWith('patch', '/admin/categories/{categoryId}', 404, 'CATEGORY_NOT_FOUND');
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    await view.user.type(screen.getByRole('textbox', { name: /^Name/ }), ' 2');
    const before = state.reads;
    await view.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('This item no longer exists. The categories were reloaded.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(before);
    });
  });
});

describe('create category (spec 03 AD-07)', { timeout: 20_000 }, () => {
  async function openCreate(view: View, under: 'root' | 'Men') {
    if (under === 'root') {
      await view.user.click(
        await screen.findByRole('button', { name: 'Add top-level category' }, { timeout: 5000 }),
      );
      return screen.getByRole('dialog', { name: 'Add category' });
    }
    await panelHeading('Men');
    await view.user.click(screen.getByRole('button', { name: 'Add subcategory' }));
    return screen.getByRole('dialog', { name: 'Add a subcategory to Men' });
  }

  it('subcategory: parent id, trimmed name, no slug when empty, default sort order after the siblings; selected after', async () => {
    serveTree(tree());
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/categories',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.created(leaf({ id: fixtureId(4), name: 'Shirts', slug: 'shirts', sortOrder: 1 }));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView(fixtureId(2));
    const dialog = await openCreate(view, 'Men');
    expect(within(dialog).getByRole('textbox', { name: /^Sort order/ })).toHaveProperty('value', '1');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), '  Shirts ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await screen.findByText('Shirts was added.')).toBeDefined();
    expect(bodies).toEqual([{ parentId: fixtureId(2), name: 'Shirts', sortOrder: 1 }]);
    expect(currentUrl()).toBe(`/catalog/categories?category=${fixtureId(4)}`);
  });

  it.each([
    ['CATEGORY_NAME_TAKEN', 409, 'Another category at this level already has this name.'],
    ['CATEGORY_SLUG_TAKEN', 409, 'This slug is taken. Enter another one.'],
    ['CATEGORY_SLUG_REQUIRED', 422, 'Enter a slug (lowercase letters, numbers and hyphens).'],
    ['CATEGORY_PARENT_INACTIVE', 409, 'Activate the parent category first.'],
    ['CATEGORY_MAX_DEPTH_EXCEEDED', 422, 'Categories can be at most 3 levels deep.'],
    ['CATEGORY_CHILD_LIMIT_REACHED', 422, 'A category can have at most 100 subcategories.'],
  ] as const)('%s is explained in the dialog', async (code, status, message) => {
    serveTree(tree());
    failWith('post', '/admin/categories', status, code);
    const view = renderView(null);
    const dialog = await openCreate(view, 'root');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), '***');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await within(dialog).findByText(message)).toBeDefined();
  });
});

describe('attributes and options (spec 03 AD-07)', { timeout: 20_000 }, () => {
  it('own attributes show their options; codes are shown but never editable', async () => {
    serveTree(tree());
    const view = renderView(fixtureId(2));
    await panelHeading('Men');
    expect(
      within(screen.getByRole('list', { name: 'Options of Size' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    await view.user.click(screen.getByRole('button', { name: 'Edit Size' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Size' });
    expect(within(dialog).getByText("Code: size (can't be changed)")).toBeDefined();
    expect(within(dialog).queryByRole('textbox', { name: /^Code/ })).toBeNull();
  });

  it('add attribute: sent as typed; the tree is read again', async () => {
    const state = serveTree(tree());
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/categories/{categoryId}/attributes',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.created({ id: fixtureId(5003), code: 'fit', name: 'Fit', sortOrder: 0, options: [] });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    await view.user.click(screen.getByRole('button', { name: 'Add attribute' }));
    const dialog = screen.getByRole('dialog', { name: 'Add attribute' });
    expect(within(dialog).getByText("The shoppers' filter key. It can't be changed later.")).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Fit');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Code/ }), 'fit');
    const before = state.reads;
    await view.user.click(within(dialog).getByRole('button', { name: 'Add attribute' }));
    expect(await screen.findByText('Fit was added.')).toBeDefined();
    expect(bodies).toEqual([{ name: 'Fit', code: 'fit', sortOrder: 0 }]);
    expect(state.reads).toBeGreaterThan(before);
  });

  it.each([
    [
      'ATTRIBUTE_CODE_CONFLICT',
      409,
      'This code is already used by this category, a parent or a subcategory.',
    ],
    [
      'CATEGORY_HAS_PRODUCTS',
      409,
      'Attributes can only be added before any product uses this category or its subcategories.',
    ],
    ['ATTRIBUTE_LIMIT_REACHED', 422, 'A category can have at most 5 attributes including inherited ones.'],
  ] as const)('add attribute: %s explained', async (code, status, message) => {
    serveTree(tree());
    failWith('post', '/admin/categories/{categoryId}/attributes', status, code);
    const view = renderView(fixtureId(3));
    await panelHeading('T-shirts');
    await view.user.click(screen.getByRole('button', { name: 'Add attribute' }));
    const dialog = screen.getByRole('dialog', { name: 'Add attribute' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Size');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Code/ }), 'size');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add attribute' }));
    expect(await within(dialog).findByText(message)).toBeDefined();
  });

  it('five effective attributes: a warning before adding', async () => {
    const many = [1, 2, 3].map((n) => ({
      id: fixtureId(5100 + n),
      code: `a${String(n)}`,
      name: `A${String(n)}`,
      sortOrder: n,
      options: [],
    }));
    serveTree(tree({ leaf: { attributes: many } }));
    renderView(fixtureId(3));
    await panelHeading('T-shirts');
    expect(screen.getByText('Effective attributes: 5 of 5')).toBeDefined();
    expect(
      screen.getByText('This category already has 5 attributes including inherited ones.'),
    ).toBeDefined();
  });

  it.each([
    ['OPTION_CODE_TAKEN', 409, 'This attribute already has an option with this code.'],
    ['OPTION_LIMIT_REACHED', 422, 'At most 100 options.'],
  ] as const)('add option: %s explained', async (code, status, message) => {
    serveTree(tree());
    failWith('post', '/admin/attributes/{attributeId}/options', status, code);
    const view = renderView(fixtureId(2));
    await panelHeading('Men');
    await view.user.click(screen.getByRole('button', { name: 'Add option to Size' }));
    const dialog = screen.getByRole('dialog', { name: 'Add option' });
    expect(within(dialog).getByRole('textbox', { name: /^Sort order/ })).toHaveProperty('value', '2');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Value/ }), 'L');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Code/ }), 'l');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add option' }));
    expect(await within(dialog).findByText(message)).toBeDefined();
  });

  it('edit option: only what changed', async () => {
    serveTree(tree());
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'patch',
        '/admin/options/{optionId}',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok(option(6001, 'Small'));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView(fixtureId(2));
    await panelHeading('Men');
    await view.user.click(screen.getByRole('button', { name: 'Edit S' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit S' });
    const value = within(dialog).getByRole('textbox', { name: /^Value/ });
    await view.user.clear(value);
    await view.user.type(value, 'Small');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Option saved.')).toBeDefined();
    expect(bodies).toEqual([{ value: 'Small' }]);
  });

  it.each([
    [
      'attribute',
      'Delete Size',
      'Delete attribute',
      '/admin/attributes/{attributeId}',
      'ATTRIBUTE_IN_USE',
      'Products in this category or its subcategories use this attribute.',
    ],
    [
      'option',
      'Delete S',
      'Delete option',
      '/admin/options/{optionId}',
      'OPTION_IN_USE',
      'A product variant uses this option.',
    ],
  ] as const)(
    'delete %s: asked first; in use explained',
    async (_kind, button, title, path, code, message) => {
      serveTree(tree());
      failWith('delete', path, 409, code);
      const view = renderView(fixtureId(2));
      await panelHeading('Men');
      await view.user.click(screen.getByRole('button', { name: button }));
      const dialog = screen.getByRole('dialog', { name: title });
      await view.user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      expect(await screen.findByText(message)).toBeDefined();
    },
  );
});

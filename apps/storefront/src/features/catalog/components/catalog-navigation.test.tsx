// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { makeTestQueryClient, renderWithProviders } from '@nile/test-utils/react';
import { publicKeys } from '@nile/query';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { CategoryNode } from '../lib/category-tree';
import { CategoriesMenu } from './categories-menu';
import { CategoryHeader } from './category-header';
import { CategoryTiles } from './category-tiles';

const server = setupMswServer();

let sequence = 0;
const node = (name: string, slug: string, children: CategoryNode[] = []): CategoryNode => {
  sequence += 1;
  return {
    id: `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    name,
    slug,
    sortOrder: sequence,
    children,
  };
};

const SHOES = node('Running Shoes', 'running-shoes');
const RUNNING = node('Running', 'running', [SHOES]);
const SPORTS = node('Sports', 'sports', [RUNNING]);
const PHONES = node('Phones', 'phones');
const ELECTRONICS = node('Electronics', 'electronics', [node('Audio', 'audio'), PHONES]);
const TREE = [ELECTRONICS, SPORTS, node('Home', 'home')];

/** The tree as the server render hydrates it into the query cache. */
function renderMenu(tree: CategoryNode[] | null = TREE) {
  const queryClient = makeTestQueryClient();
  if (tree !== null) queryClient.setQueryData(publicKeys.categoriesTree(), tree);
  return renderWithProviders(<CategoriesMenu />, { queryClient });
}

// Both triggers are in the DOM; CSS shows the dropdown from md and the drawer below it.
function triggers(): { desktop: HTMLElement; drawer: HTMLElement } {
  const [desktop, drawer] = screen.getAllByRole('button', { name: 'Categories' });
  if (desktop === undefined || drawer === undefined) throw new Error('expected both menu triggers');
  return { desktop, drawer };
}
const desktopTrigger = () => triggers().desktop;
const drawerTrigger = () => triggers().drawer;

describe('categories menu (spec 01 §2.2)', () => {
  it('desktop: each top-level category with its children, in API order, linking to their pages', async () => {
    const view = renderMenu();
    await view.user.click(desktopTrigger());
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => [item.textContent, item.getAttribute('href')]);
    expect(items).toEqual([
      ['Electronics', '/c/electronics'],
      ['Audio', '/c/audio'],
      ['Phones', '/c/phones'],
      ['Sports', '/c/sports'],
      ['Running', '/c/running'],
      ['Home', '/c/home'],
    ]);
  });

  it('phones: a drawer whose levels expand down to the third', async () => {
    const view = renderMenu();
    await view.user.click(drawerTrigger());
    const drawer = screen.getByRole('dialog', { name: 'Categories' });
    expect(within(drawer).queryByRole('link', { name: 'Running' })).toBeNull();

    const expandSports = within(drawer).getByRole('button', { name: 'Show subcategories of Sports' });
    expect(expandSports.getAttribute('aria-expanded')).toBe('false');
    await view.user.click(expandSports);
    expect(expandSports.getAttribute('aria-expanded')).toBe('true');
    await view.user.click(within(drawer).getByRole('button', { name: 'Show subcategories of Running' }));
    expect(within(drawer).getByRole('link', { name: 'Running Shoes' }).getAttribute('href')).toBe(
      '/c/running-shoes',
    );
    expect(within(drawer).queryByRole('button', { name: /Show subcategories of Home/ })).toBeNull();
  });

  it('when the tree could not be loaded: says so and retries on request', async () => {
    let calls = 0;
    server.use(
      mockApi(
        'get',
        '/categories',
        ({ reply }) => {
          calls += 1;
          return calls === 1 ? reply.error(500, 'INTERNAL_ERROR') : reply.ok(TREE);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderMenu(null);
    await view.user.click(drawerTrigger());
    const drawer = screen.getByRole('dialog', { name: 'Categories' });
    expect(await within(drawer).findByText("Categories couldn't be loaded.")).toBeDefined();
    await view.user.click(within(drawer).getByRole('button', { name: 'Try again' }));
    expect(await within(drawer).findByRole('link', { name: 'Electronics' })).toBeDefined();
  });

  it('with no categories: says so', async () => {
    const view = renderMenu([]);
    await view.user.click(desktopTrigger());
    expect(screen.getByRole('menuitem').textContent).toBe('No categories yet.');
  });
});

describe('category header (spec 01 SF-02)', () => {
  it('breadcrumbs Home › ancestors › current (not a link), title, direct subcategories as chips', () => {
    renderWithProviders(<CategoryHeader path={[SPORTS, RUNNING]} />);
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const crumbs = within(breadcrumb)
      .getAllByRole('listitem')
      .map((item) => item.textContent.replace('›', '').trim());
    expect(crumbs).toEqual(['Home', 'Sports', 'Running']);
    expect(within(breadcrumb).getByRole('link', { name: 'Sports' }).getAttribute('href')).toBe('/c/sports');
    expect(within(breadcrumb).getByText('Running').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1, name: 'Running' })).toBeDefined();
    const chips = screen.getByRole('navigation', { name: 'Subcategories' });
    expect(within(chips).getByRole('link', { name: 'Running Shoes' }).getAttribute('href')).toBe(
      '/c/running-shoes',
    );
  });

  it('a leaf category has no subcategory chips', () => {
    renderWithProviders(<CategoryHeader path={[SPORTS, RUNNING, SHOES]} />);
    expect(screen.queryByRole('navigation', { name: 'Subcategories' })).toBeNull();
  });
});

describe('home "Shop by category" (spec 01 SF-01)', () => {
  it('one tile per top-level category', () => {
    renderWithProviders(<CategoryTiles tree={TREE} />);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Electronics',
      'Sports',
      'Home',
    ]);
  });

  it('is hidden when there are no categories', () => {
    const view = renderWithProviders(<CategoryTiles tree={[]} />);
    expect(view.container.childElementCount).toBe(0);
  });
});

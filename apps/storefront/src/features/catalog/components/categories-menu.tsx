'use client';

import { categoriesTreeQuery } from '@nile/query';
import {
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  UI_COPY,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { browserApi } from '@/lib/browser-api';
import { categoryHref } from '../lib/category-href';
import type { CategoryNode } from '../lib/category-tree';
import { CATALOG_COPY } from '../copy';

// Header categories menu (spec 01 §2.2): desktop dropdown with top-level categories and their children;
// phones get a drawer with expandable levels. The tree is server-prefetched (hydrated), so it renders at once.

function useCategoryTree() {
  return useQuery(categoriesTreeQuery(browserApi));
}

type TreeQuery = ReturnType<typeof useCategoryTree>;

/** Loading / error / empty text shared by both menus; null when there are categories to show. */
function stateMessage(tree: TreeQuery): string | null {
  if (tree.isPending) return CATALOG_COPY.categoriesLoading;
  if (tree.isError) return CATALOG_COPY.categoriesFailed;
  if (tree.data.length === 0) return CATALOG_COPY.noCategories;
  return null;
}

function DesktopMenu({ tree }: { readonly tree: TreeQuery }) {
  const message = stateMessage(tree);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="hidden md:inline-flex">
          <LayoutGrid aria-hidden="true" />
          {CATALOG_COPY.categories}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] min-w-64 overflow-y-auto">
        {message !== null ? (
          <DropdownMenuItem
            disabled={!tree.isError}
            onSelect={(event) => {
              event.preventDefault();
              void tree.refetch();
            }}
          >
            {message}
            {tree.isError ? ` ${UI_COPY.tryAgain}` : null}
          </DropdownMenuItem>
        ) : (
          (tree.data ?? []).map((top) => [
            <DropdownMenuItem key={top.id} asChild className="font-semibold">
              <Link href={categoryHref(top.slug)}>{top.name}</Link>
            </DropdownMenuItem>,
            ...top.children.map((child) => (
              <DropdownMenuItem key={child.id} asChild className="ps-6">
                <Link href={categoryHref(child.slug)}>{child.name}</Link>
              </DropdownMenuItem>
            )),
          ])
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DrawerNode({ node, onNavigate }: { readonly node: CategoryNode; readonly onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const childrenId = useId();
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={categoryHref(node.slug)}
          onClick={onNavigate}
          className="flex-1 rounded-md px-3 py-2 text-sm hover:bg-muted"
        >
          {node.name}
        </Link>
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-controls={childrenId}
            aria-label={CATALOG_COPY.showSubcategories(node.name)}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <ChevronDown aria-hidden="true" className={open ? 'rotate-180' : undefined} />
          </Button>
        ) : null}
      </div>
      {hasChildren && open ? (
        <ul id={childrenId} className="ms-3 border-s border-border ps-2">
          {node.children.map((child) => (
            <DrawerNode key={child.id} node={child} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MobileDrawer({ tree }: { readonly tree: TreeQuery }) {
  const [open, setOpen] = useState(false);
  const message = stateMessage(tree);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="ghost"
        className="md:hidden"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <LayoutGrid aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{CATALOG_COPY.categories}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={CATALOG_COPY.categories} placement="start">
          {message !== null ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{message}</p>
              {tree.isError ? (
                <Button variant="outline" size="sm" onClick={() => void tree.refetch()}>
                  {UI_COPY.tryAgain}
                </Button>
              ) : null}
            </div>
          ) : (
            <nav aria-label={CATALOG_COPY.categories}>
              <ul className="space-y-1">
                {(tree.data ?? []).map((node) => (
                  <DrawerNode key={node.id} node={node} onNavigate={close} />
                ))}
              </ul>
            </nav>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CategoriesMenu() {
  const tree = useCategoryTree();
  return (
    <>
      <DesktopMenu tree={tree} />
      <MobileDrawer tree={tree} />
    </>
  );
}

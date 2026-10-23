'use client';

import { isApiError } from '@nile/api';
import { Badge, Button, cn, ErrorState, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ROUTES } from '@/lib/routes';
import { categoryTreeQuery, type CategoryNode } from '../api';
import { CATALOG_COPY as COPY } from '../copy';
import { findNode, pathTo, sortedNodes } from '../lib/tree';
import { CategoryPanel } from './category-panel';
import { CreateCategoryDialog } from './dialogs';

/** The selected category lives in the URL (`?category=`), so a reload or a shared link keeps it. */
export const CATEGORY_PARAM = 'category';

export const selectHref = (categoryId: string) => `${ROUTES.categories}?${CATEGORY_PARAM}=${categoryId}`;

/**
 * AD-07 Categories (AD-Q-9): the whole tree on the left, the selected category's panel on the right.
 * `initialSelectedId` comes from the URL (reload, shared link). A click selects at once in the browser and
 * mirrors the choice to the URL with `history.replaceState` (integrated with the Next.js router): no server
 * round trip, since the tree and panel are client-rendered from one query. Selecting by router navigation
 * left the panel unchanged in the running app (reported 2026-10-15).
 */
export function CategoriesView({ initialSelectedId }: { readonly initialSelectedId: string | null }) {
  const tree = useQuery(categoryTreeQuery());
  const [addingRoot, setAddingRoot] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const select = (categoryId: string) => {
    setSelectedId(categoryId);
    window.history.replaceState(null, '', selectHref(categoryId));
  };

  const header = (
    <PageHeader
      title={COPY.title}
      actions={
        <Button
          onClick={() => {
            setAddingRoot(true);
          }}
        >
          {COPY.addTopLevel}
        </Button>
      }
    />
  );

  if (tree.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void tree.refetch()}
          correlationId={isApiError(tree.error) ? (tree.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (tree.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <Skeleton className="h-96" />
      </div>
    );
  }

  const nodes = tree.data;
  const selected = selectedId === null ? undefined : findNode(nodes, selectedId);
  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label={COPY.treeLabel} className="rounded-lg border border-border p-2">
          {nodes.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">{COPY.emptyTree}</p>
          ) : (
            <TreeLevel
              nodes={nodes}
              selectedId={selected?.id ?? null}
              openPath={selected === undefined ? [] : pathTo(nodes, selected.id).map((node) => node.id)}
              onSelect={select}
            />
          )}
        </nav>
        <div>
          {selected === undefined ? (
            <p className="text-muted-foreground">
              {selectedId === null ? COPY.selectPrompt : COPY.notInTree}
            </p>
          ) : (
            <CategoryPanel key={selected.id} tree={nodes} node={selected} onSelect={select} />
          )}
        </div>
      </div>
      {addingRoot ? (
        <CreateCategoryDialog
          parent={null}
          siblings={nodes}
          onClose={() => {
            setAddingRoot(false);
          }}
          onCreated={(created) => {
            select(created.id);
          }}
        />
      ) : null}
    </div>
  );
}

interface TreeLevelProps {
  readonly nodes: readonly CategoryNode[];
  readonly selectedId: string | null;
  /** Ids from the root to the selected node: those branches start open. */
  readonly openPath: readonly string[];
  readonly onSelect: (categoryId: string) => void;
}

/** Nested lists of buttons (expand/collapse per branch); inactive nodes greyed with a badge. */
function TreeLevel({ nodes, selectedId, openPath, onSelect }: TreeLevelProps) {
  return (
    <ul className="space-y-0.5">
      {sortedNodes(nodes).map((node) => (
        <TreeItem key={node.id} node={node} selectedId={selectedId} openPath={openPath} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  selectedId,
  openPath,
  onSelect,
}: Omit<TreeLevelProps, 'nodes'> & { readonly node: CategoryNode }) {
  const [open, setOpen] = useState(openPath.includes(node.id));
  const hasChildren = node.children.length > 0;
  const selected = node.id === selectedId;
  return (
    <li>
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-expanded={open}
            aria-label={open ? COPY.collapse(node.name) : COPY.expand(node.name)}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </Button>
        ) : (
          <span className="size-7 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            onSelect(node.id);
          }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
            selected && 'bg-muted font-medium',
            !node.isActive && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{node.name}</span>
          {node.isActive ? null : <Badge tone="neutral">{COPY.inactive}</Badge>}
        </button>
      </div>
      {hasChildren && open ? (
        <div className="ms-6">
          <TreeLevel nodes={node.children} selectedId={selectedId} openPath={openPath} onSelect={onSelect} />
        </div>
      ) : null}
    </li>
  );
}

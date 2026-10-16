'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { errorMessage } from '@nile/query';
import { Badge, Button, ConfirmDialog, Field, FormAlert, Input, Label, Switch, toast } from '@nile/ui';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { updateCategory, type CategoryNode } from '../api';
import { CATALOG_COPY as COPY } from '../copy';
import { canHaveChildren, pathTo } from '../lib/tree';
import { categoryPatch, categorySchema, categoryValues, type CategoryValues } from '../schemas';
import { AttributesSection } from './attributes-section';
import { CreateCategoryDialog } from './dialogs';
import { useCatalogRefresh, useGoneHandler } from './form-dialog';

export interface CategoryPanelProps {
  readonly tree: readonly CategoryNode[];
  readonly node: CategoryNode;
  readonly onSelect: (categoryId: string) => void;
}

/** AD-07 right-hand panel for the selected category. */
export function CategoryPanel({ tree, node, onSelect }: CategoryPanelProps) {
  const path = pathTo(tree, node.id);
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  const [adding, setAdding] = useState(false);
  const addReasonId = useId();
  const parentInactive = parent !== undefined && !parent.isActive;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{node.name}</h2>
        {node.isActive ? null : <Badge tone="neutral">{COPY.inactive}</Badge>}
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-1 text-sm">
        <dt className="text-muted-foreground">{COPY.depth}</dt>
        <dd>{node.depth}</dd>
        <dt className="text-muted-foreground">{COPY.parent}</dt>
        <dd>{parent?.name ?? COPY.topLevel}</dd>
      </dl>
      {/* Keyed by the API's values: a refetched tree resets the form to them. */}
      <DetailsForm key={`${node.id}:${node.name}:${node.slug}:${String(node.sortOrder)}`} node={node} />
      <ActiveSwitch node={node} parentInactive={parentInactive} />
      {canHaveChildren(node) ? (
        <div className="space-y-1">
          <Button
            variant="outline"
            disabled={!node.isActive}
            aria-describedby={node.isActive ? undefined : addReasonId}
            onClick={() => {
              setAdding(true);
            }}
          >
            {COPY.addSubcategory}
          </Button>
          {node.isActive ? null : (
            <p id={addReasonId} className="text-sm text-muted-foreground">
              {COPY.parentInactive}
            </p>
          )}
        </div>
      ) : null}
      <AttributesSection tree={tree} node={node} />
      {adding ? (
        <CreateCategoryDialog
          parent={node}
          siblings={node.children}
          onClose={() => {
            setAdding(false);
          }}
          onCreated={(created) => {
            onSelect(created.id);
          }}
        />
      ) : null}
    </div>
  );
}

function DetailsForm({ node }: { readonly node: CategoryNode }) {
  const refresh = useCatalogRefresh();
  const handleGone = useGoneHandler();
  const failure = useSubmitFailure();
  const form = useForm<CategoryValues, unknown, z.output<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: categoryValues(node),
  });
  const slug = useWatch({ control: form.control, name: 'slug' });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = categoryPatch(values, node);
    if (patch === null) return;
    try {
      await updateCategory(node.id, patch);
      await refresh();
      toast({ title: COPY.saved });
    } catch (error) {
      if (isApiError(error, 'CATEGORY_NAME_TAKEN'))
        form.setError('name', { message: COPY.errors.CATEGORY_NAME_TAKEN });
      else if (isApiError(error, 'CATEGORY_SLUG_TAKEN'))
        form.setError('slug', { message: COPY.errors.CATEGORY_SLUG_TAKEN });
      else if (!handleGone(error)) failure.fail(error);
    }
  });

  return (
    <section aria-labelledby="category-details-heading" className="max-w-xl space-y-3">
      <h3 id="category-details-heading" className="font-semibold">
        {COPY.detailsHeading}
      </h3>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="name"
          label={COPY.name}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
        />
        <Field
          control={form.control}
          name="slug"
          label={COPY.slug}
          // [PROPOSED in spec 03]: a changed slug changes the public address.
          description={slug !== '' && slug !== node.slug ? COPY.slugChangeWarning : COPY.slugHelp}
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
        />
        <Field
          control={form.control}
          name="sortOrder"
          label={COPY.sortOrder}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
        />
        <Button type="submit" loading={form.formState.isSubmitting} disabled={failure.blocked}>
          {COPY.save}
        </Button>
      </form>
    </section>
  );
}

/**
 * Active toggle [SPEC 06 CA-13]: activating needs an active parent (disabled with the reason otherwise);
 * deactivating is confirmed and refused while subcategories are active or products use it (`CATEGORY_IN_USE`).
 */
function ActiveSwitch({
  node,
  parentInactive,
}: {
  readonly node: CategoryNode;
  readonly parentInactive: boolean;
}) {
  const refresh = useCatalogRefresh();
  const handleGone = useGoneHandler();
  const id = useId();
  const reasonId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const blocked = !node.isActive && parentInactive;

  const send = async (isActive: boolean) => {
    setPending(true);
    try {
      await updateCategory(node.id, { isActive });
      await refresh();
      toast({ title: COPY.saved });
    } catch (error) {
      if (isApiError(error, 'CATEGORY_IN_USE'))
        toast({ title: COPY.errors.CATEGORY_IN_USE, tone: 'destructive' });
      else if (isApiError(error, 'CATEGORY_PARENT_INACTIVE')) {
        void refresh();
        toast({ title: COPY.errors.CATEGORY_PARENT_INACTIVE, tone: 'destructive' });
      } else if (!handleGone(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={node.isActive}
          disabled={blocked || pending}
          aria-describedby={blocked ? reasonId : undefined}
          onCheckedChange={(checked) => {
            if (checked) void send(true);
            else setConfirming(true);
          }}
        />
        <Label htmlFor={id}>{COPY.active}</Label>
      </div>
      {blocked ? (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {COPY.parentInactive}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={COPY.deactivateTitle}
        description={COPY.deactivateConfirm(node.name)}
        confirmLabel={COPY.deactivate}
        destructive
        onConfirm={() => send(false)}
      />
    </div>
  );
}

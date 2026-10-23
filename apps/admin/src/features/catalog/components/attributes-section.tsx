'use client';

import { isApiError } from '@nile/api';
import { errorMessage } from '@nile/query';
import { Button, ConfirmDialog, Notice, toast } from '@nile/ui';
import { useState } from 'react';
import {
  deleteAttribute,
  deleteOption,
  type AttributeOption,
  type CategoryAttribute,
  type CategoryNode,
} from '../api';
import { CATALOG_COPY as COPY } from '../copy';
import {
  effectiveAttributeCount,
  inheritedAttributes,
  MAX_EFFECTIVE_ATTRIBUTES,
  sortedAttributes,
} from '../lib/tree';
import { AddAttributeDialog, AddOptionDialog, EditLabelDialog, type LabelEditTarget } from './dialogs';
import { useCatalogRefresh, useGoneHandler } from './form-dialog';

type Dialog =
  | { readonly kind: 'addAttribute' }
  | { readonly kind: 'addOption'; readonly attribute: CategoryAttribute }
  | { readonly kind: 'edit'; readonly target: LabelEditTarget }
  | { readonly kind: 'deleteAttribute'; readonly attribute: CategoryAttribute }
  | { readonly kind: 'deleteOption'; readonly option: AttributeOption }
  | null;

/**
 * AD-07 attributes: the category's own (editable, with their options) and the inherited ones (read-only),
 * with "Effective attributes: {n} of 5". Codes are never editable (no control) [SPEC 06].
 */
export function AttributesSection({
  tree,
  node,
}: {
  readonly tree: readonly CategoryNode[];
  readonly node: CategoryNode;
}) {
  const refresh = useCatalogRefresh();
  const handleGone = useGoneHandler();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => {
    setDialog(null);
  };
  const inherited = inheritedAttributes(tree, node.id);
  const effective = effectiveAttributeCount(tree, node.id);

  /** Deletes: a refusal is explained by code; anything else is the default message. */
  const remove = async (
    run: () => Promise<void>,
    done: string,
    inUse: 'ATTRIBUTE_IN_USE' | 'OPTION_IN_USE',
  ) => {
    try {
      await run();
      await refresh();
      toast({ title: done });
    } catch (error) {
      if (isApiError(error, inUse)) toast({ title: COPY.errors[inUse], tone: 'destructive' });
      else if (!handleGone(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    }
  };

  return (
    <section aria-labelledby="attributes-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="attributes-heading" className="font-semibold">
          {COPY.attributesHeading}
        </h3>
        <Button
          variant="outline"
          onClick={() => {
            setDialog({ kind: 'addAttribute' });
          }}
        >
          {COPY.addAttribute}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{COPY.effective(effective, MAX_EFFECTIVE_ATTRIBUTES)}</p>
      {/* A pre-check only: the backend decides (spec 03 AD-07). */}
      {effective >= MAX_EFFECTIVE_ATTRIBUTES ? <Notice>{COPY.limitWarning}</Notice> : null}
      {node.attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noAttributes}</p>
      ) : (
        <ul className="space-y-3">
          {sortedAttributes(node.attributes).map((attribute) => (
            <li key={attribute.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{attribute.name}</span>{' '}
                  <code className="text-xs text-muted-foreground">{attribute.code}</code>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={COPY.editAttribute(attribute.name)}
                    onClick={() => {
                      setDialog({ kind: 'edit', target: { kind: 'attribute', item: attribute } });
                    }}
                  >
                    {COPY.edit}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={COPY.deleteAttribute(attribute.name)}
                    onClick={() => {
                      setDialog({ kind: 'deleteAttribute', attribute });
                    }}
                  >
                    {COPY.delete}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={COPY.addOption(attribute.name)}
                    onClick={() => {
                      setDialog({ kind: 'addOption', attribute });
                    }}
                  >
                    {COPY.addOptionTitle}
                  </Button>
                </span>
              </div>
              {attribute.options.length === 0 ? (
                <p className="text-sm text-muted-foreground">{COPY.noOptions}</p>
              ) : (
                <ul aria-label={COPY.optionsOf(attribute.name)} className="flex flex-wrap gap-2">
                  {[...attribute.options]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((option) => (
                      <li
                        key={option.id}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"
                      >
                        <span>{option.value}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={COPY.editOption(option.value)}
                          onClick={() => {
                            setDialog({ kind: 'edit', target: { kind: 'option', item: option } });
                          }}
                        >
                          {COPY.edit}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={COPY.deleteOption(option.value)}
                          onClick={() => {
                            setDialog({ kind: 'deleteOption', option });
                          }}
                        >
                          {COPY.delete}
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <h3 className="font-semibold">{COPY.inheritedHeading}</h3>
        {inherited.length === 0 ? (
          <p className="text-sm text-muted-foreground">{COPY.noInherited}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {inherited.map(({ attribute, from }) => (
              <li key={attribute.id}>
                <span className="font-medium">{attribute.name}</span>{' '}
                <span className="text-muted-foreground">
                  {COPY.inheritedFrom(from.name)} ·{' '}
                  {attribute.options.map((option) => option.value).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialog?.kind === 'addAttribute' ? <AddAttributeDialog category={node} onClose={close} /> : null}
      {dialog?.kind === 'addOption' ? <AddOptionDialog attribute={dialog.attribute} onClose={close} /> : null}
      {dialog?.kind === 'edit' ? <EditLabelDialog target={dialog.target} onClose={close} /> : null}
      <ConfirmDialog
        open={dialog?.kind === 'deleteAttribute'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={COPY.deleteAttributeTitle}
        description={
          dialog?.kind === 'deleteAttribute' ? COPY.deleteAttributeConfirm(dialog.attribute.name) : ''
        }
        confirmLabel={COPY.delete}
        destructive
        onConfirm={() =>
          dialog?.kind === 'deleteAttribute'
            ? remove(
                () => deleteAttribute(dialog.attribute.id),
                COPY.attributeDeleted(dialog.attribute.name),
                'ATTRIBUTE_IN_USE',
              )
            : undefined
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteOption'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={COPY.deleteOptionTitle}
        description={dialog?.kind === 'deleteOption' ? COPY.deleteOptionConfirm(dialog.option.value) : ''}
        confirmLabel={COPY.delete}
        destructive
        onConfirm={() =>
          dialog?.kind === 'deleteOption'
            ? remove(
                () => deleteOption(dialog.option.id),
                COPY.optionDeleted(dialog.option.value),
                'OPTION_IN_USE',
              )
            : undefined
        }
      />
    </section>
  );
}

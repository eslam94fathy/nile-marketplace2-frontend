'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { fields } from '@nile/domain';
import { MEDIA_ACCEPT, useImageUploads, type UploadTile } from '@nile/media';
import { errorMessage } from '@nile/query';
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  NileImage,
  toast,
  UploadTiles,
  useCooldown,
  type UploadTileView,
} from '@nile/ui';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { browserApi } from '@/lib/browser-api';
import { removeCategoryImage, setCategoryImage, type CategoryNode } from '../api';
import { CATALOG_COPY } from '../copy';
import { FormDialog, useCatalogRefresh, useGoneHandler } from './form-dialog';

const COPY = CATALOG_COPY.image;

/** A category has one image: a new upload replaces it (backend: "the previous image is released"). */
const CATEGORY_IMAGE_MAX = 1;

function tileView(tile: UploadTile): UploadTileView {
  return {
    key: tile.key,
    fileName: tile.fileName,
    previewUrl: tile.previewUrl,
    status: tile.status,
    progress: tile.progress,
    message: tile.message,
    canRetry: tile.canRetry,
  };
}

/**
 * AD-07 "Image" (spec 03 §7.3): preview, upload (purpose `category_image`, set with `PUT …/image` once `ready`),
 * edit the description (the same `PUT` with the current media id), remove (confirmed). The tree is read again
 * after every write.
 */
export function CategoryImage({ node }: { readonly node: CategoryNode }) {
  const refresh = useCatalogRefresh();
  const handleGone = useGoneHandler();
  const cooldown = useCooldown();
  const uploads = useImageUploads({
    api: browserApi,
    purpose: 'category_image',
    max: CATEGORY_IMAGE_MAX,
    onRateLimited: cooldown.start,
  });
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const image = node.image;

  // A ready upload is set once; a newer state of the hook is read when the request answers.
  const live = useRef({ uploads, refresh, handleGone });
  useEffect(() => {
    live.current = { uploads, refresh, handleGone };
  });
  const setting = useRef(new Set<string>());
  useEffect(() => {
    for (const tile of uploads.tiles) {
      const mediaId = tile.mediaId;
      if (tile.status !== 'ready' || mediaId === null || setting.current.has(tile.key)) continue;
      setting.current.add(tile.key);
      void (async () => {
        try {
          await setCategoryImage(node.id, { mediaId });
          await live.current.refresh();
          live.current.uploads.remove(tile.key);
          setAnnouncement(COPY.set);
          toast({ title: COPY.set });
        } catch (error) {
          if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
            // The tile asks for the photo again (conventions §12.2).
            live.current.uploads.markNotAttachable([mediaId]);
            return;
          }
          live.current.uploads.remove(tile.key);
          if (!live.current.handleGone(error)) toast({ title: errorMessage(error), tone: 'destructive' });
        }
      })();
    }
  }, [node.id, uploads.tiles]);

  const remove = async () => {
    try {
      await removeCategoryImage(node.id);
      toast({ title: COPY.removed });
    } catch (error) {
      if (!handleGone(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      void refresh();
    }
  };

  return (
    <section aria-labelledby="category-image-heading" className="max-w-xl space-y-3">
      <h3 id="category-image-heading" className="font-semibold">
        {COPY.heading}
      </h3>
      <p className="text-sm text-muted-foreground">{COPY.note}</p>
      <div className="flex flex-wrap items-start gap-4">
        <NileImage
          image={image}
          alt={image?.altText ?? node.name}
          sizes="160px"
          placeholder="category"
          className="aspect-square w-40 rounded-md bg-muted object-cover"
        />
        {image === null ? (
          <p className="text-sm text-muted-foreground">{COPY.none}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>{image.altText ?? COPY.noDescription}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {COPY.editDescription}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRemoving(true);
                }}
              >
                {COPY.remove}
              </Button>
            </div>
          </div>
        )}
      </div>
      <UploadTiles
        tiles={uploads.tiles.map(tileView)}
        refusals={uploads.refusals}
        announcement={uploads.announcement}
        accept={MEDIA_ACCEPT}
        canAddMore={uploads.canAddMore}
        onAdd={uploads.add}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
        cooldownSeconds={cooldown.remaining}
        label={image === null ? COPY.upload : COPY.replace}
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {editing && image !== null ? (
        <DescriptionDialog
          node={node}
          mediaId={image.id}
          altText={image.altText}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={COPY.removeTitle}
        description={COPY.removeConfirm(node.name)}
        confirmLabel={COPY.remove}
        destructive
        onConfirm={remove}
      />
    </section>
  );
}

/** `SetCategoryImageDto.altText`: 1..200, trimmed [VERIFIED]. */
const descriptionSchema = z.object({ altText: fields.trimmedString(1, 200) });
type DescriptionValues = z.input<typeof descriptionSchema>;

function DescriptionDialog({
  node,
  mediaId,
  altText,
  onClose,
}: {
  readonly node: CategoryNode;
  readonly mediaId: string;
  readonly altText: string | null;
  readonly onClose: () => void;
}) {
  const refresh = useCatalogRefresh();
  const form = useForm<DescriptionValues, unknown, z.output<typeof descriptionSchema>>({
    resolver: zodResolver(descriptionSchema),
    mode: 'onBlur',
    defaultValues: { altText: altText ?? '' },
  });
  return (
    <FormDialog
      title={COPY.editDescription}
      confirmLabel={COPY.save}
      form={form}
      onClose={onClose}
      onSubmit={async (values) => {
        try {
          await setCategoryImage(node.id, { mediaId, altText: values.altText });
        } catch (error) {
          if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
            void refresh();
            toast({ title: COPY.reupload, tone: 'destructive' });
            return true;
          }
          throw error;
        }
        await refresh();
        toast({ title: COPY.descriptionSaved });
        return true;
      }}
    >
      <Field
        control={form.control}
        name="altText"
        label={COPY.description}
        description={COPY.descriptionHint}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
    </FormDialog>
  );
}

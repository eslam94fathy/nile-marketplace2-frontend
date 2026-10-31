'use client';

import { isApiError } from '@nile/api';
import { imageAlt } from '@nile/domain';
import { MEDIA_ACCEPT, useImageUploads, type ImageUploads, type UploadTile } from '@nile/media';
import { errorMessage } from '@nile/query';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NileImage,
  toast,
  UploadTiles,
  useCooldown,
  type UploadTileView,
} from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import {
  addProductImage,
  deleteProductImage,
  productKeys,
  reorderProductImages,
  type ProductImage,
  type SellerProduct,
} from '../api';
import { PRODUCTS_COPY } from '../copy';
import { movedOrder, orderedImages, PRODUCT_IMAGE_MAX, variantOfImage, type ImageMove } from '../lib/images';
import { variantShortLabel } from '../lib/variants';
import { ImageEditDialog } from './image-edit-dialog';
import { useProductBlockedHandler } from './product-blocked';

const COPY = PRODUCTS_COPY.images;

const correlationOf = (error: unknown) =>
  isApiError(error) ? (error.correlationId ?? undefined) : undefined;

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
 * SE-10-I Images: up to 8 in order, the first is the main image. Each upload is attached as soon as it is ready
 * (`POST …/images`, one at a time so answers can't overtake each other); moves send the full order (SE-Q-9).
 */
export function ProductImages({ product }: { readonly product: SellerProduct }) {
  const queryClient = useQueryClient();
  const access = useSellerAccess();
  const handleNotApproved = useNotApprovedHandler();
  const handleBlocked = useProductBlockedHandler(product.id);
  const cooldown = useCooldown();
  const reasonId = useId();
  const images = orderedImages(product.images);
  const uploads = useImageUploads({
    api: browserApi,
    purpose: 'product_image',
    max: PRODUCT_IMAGE_MAX - images.length,
    onRateLimited: cooldown.start,
  });
  const [announcement, setAnnouncement] = useState('');
  const [editing, setEditing] = useState<ProductImage | null>(null);
  const [removing, setRemoving] = useState<ProductImage | null>(null);
  const [moving, setMoving] = useState(false);

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };

  /** Add and reorder answer with the whole list: it replaces the cached images (design 02 §5.4). */
  const setImages = (list: ProductImage[]) => {
    queryClient.setQueryData<SellerProduct>(productKeys.detail(product.id), (current) =>
      current === undefined ? current : { ...current, images: list },
    );
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  };

  /** Reports a failed write; true when it was handled without the generic message. */
  const handled = (error: unknown): boolean => {
    if (handleNotApproved(error) || handleBlocked(error)) return true;
    if (isApiError(error, 'PRODUCT_IMAGE_LIMIT_REACHED')) {
      refetch();
      toast({ title: COPY.limit, tone: 'destructive' });
      return true;
    }
    if (isApiError(error, 'PRODUCT_IMAGE_ORDER_INVALID')) {
      refetch();
      toast({ title: COPY.orderChanged, tone: 'destructive' });
      return true;
    }
    if (isApiError(error, 'PRODUCT_IMAGE_NOT_FOUND')) {
      refetch();
      toast({ title: COPY.gone, tone: 'destructive' });
      return true;
    }
    return false;
  };

  // Ready uploads are attached in tile order, one request at a time.
  const live = useRef({ uploads, setImages, handled });
  useEffect(() => {
    live.current = { uploads, setImages, handled };
  });
  const attaching = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    for (const tile of uploads.tiles) {
      const mediaId = tile.mediaId;
      if (tile.status !== 'ready' || mediaId === null || attaching.current.has(tile.key)) continue;
      attaching.current.add(tile.key);
      queue.current = queue.current.then(async () => {
        try {
          live.current.setImages(await addProductImage(product.id, mediaId));
          live.current.uploads.remove(tile.key);
          setAnnouncement(COPY.added);
        } catch (error) {
          if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
            // The tile asks for the photo again (conventions §12.2).
            live.current.uploads.markNotAttachable([mediaId]);
            return;
          }
          live.current.uploads.remove(tile.key);
          if (!live.current.handled(error)) {
            toast({ title: errorMessage(error), tone: 'destructive', correlationId: correlationOf(error) });
          }
        }
      });
    }
  }, [product.id, uploads.tiles]);

  const move = async (image: ProductImage, direction: ImageMove) => {
    const order = movedOrder(images, image.id, direction);
    if (order === null) return;
    setMoving(true);
    try {
      setImages(await reorderProductImages(product.id, order));
      setAnnouncement(COPY.moved(order.indexOf(image.id) + 1, order.length));
    } catch (error) {
      if (!handled(error)) {
        toast({ title: errorMessage(error), tone: 'destructive', correlationId: correlationOf(error) });
      }
    } finally {
      setMoving(false);
    }
  };

  const remove = async () => {
    if (removing === null) return;
    try {
      await deleteProductImage(product.id, removing.id);
      toast({ title: COPY.removed });
    } catch (error) {
      // Already gone: the outcome the seller wanted.
      if (
        !isApiError(error, 'PRODUCT_IMAGE_NOT_FOUND') &&
        !handleNotApproved(error) &&
        !handleBlocked(error)
      ) {
        toast({ title: errorMessage(error), tone: 'destructive', correlationId: correlationOf(error) });
      }
    } finally {
      refetch();
    }
  };

  const full = images.length >= PRODUCT_IMAGE_MAX;
  const describedBy = access.reason === null ? undefined : reasonId;

  return (
    <section aria-labelledby="images-heading" className="space-y-4">
      <h2 id="images-heading" className="text-lg font-semibold">
        {COPY.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{COPY.note}</p>
      {access.reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {access.reason}
        </p>
      )}
      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">{COPY.none}</p>
      ) : (
        <ul aria-label={COPY.listLabel} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <ImageTile
              key={image.id}
              product={product}
              image={image}
              index={index}
              total={images.length}
              disabled={!access.catalog || moving}
              describedBy={describedBy}
              onMove={(direction) => void move(image, direction)}
              onEdit={() => {
                setEditing(image);
              }}
              onRemove={() => {
                setRemoving(image);
              }}
            />
          ))}
        </ul>
      )}
      <Uploader
        uploads={uploads}
        disabled={!access.catalog}
        full={full}
        cooldownSeconds={cooldown.remaining}
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ImageEditDialog
        product={product}
        image={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={COPY.removeTitle}
        description={COPY.removeConfirm}
        confirmLabel={COPY.remove}
        destructive
        onConfirm={remove}
      />
    </section>
  );
}

function Uploader({
  uploads,
  disabled,
  full,
  cooldownSeconds,
}: {
  readonly uploads: ImageUploads;
  readonly disabled: boolean;
  readonly full: boolean;
  readonly cooldownSeconds: number;
}) {
  return (
    <UploadTiles
      tiles={uploads.tiles.map(tileView)}
      refusals={uploads.refusals}
      announcement={uploads.announcement}
      accept={MEDIA_ACCEPT}
      canAddMore={uploads.canAddMore && !full}
      onAdd={uploads.add}
      onRemove={uploads.remove}
      onRetry={uploads.retry}
      cooldownSeconds={cooldownSeconds}
      disabled={disabled}
      label={COPY.add}
      {...(full ? { hint: COPY.limit } : {})}
    />
  );
}

interface ImageTileProps {
  readonly product: SellerProduct;
  readonly image: ProductImage;
  readonly index: number;
  readonly total: number;
  readonly disabled: boolean;
  readonly describedBy: string | undefined;
  readonly onMove: (direction: ImageMove) => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}

function ImageTile({
  product,
  image,
  index,
  total,
  disabled,
  describedBy,
  onMove,
  onEdit,
  onRemove,
}: ImageTileProps) {
  const variant = variantOfImage(product, image);
  const first = index === 0;
  const last = index === total - 1;
  return (
    <li className="space-y-2 rounded-lg border border-border p-2 text-sm">
      <NileImage
        image={image}
        alt={imageAlt(image, product.name)}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        placeholder="product"
        className="aspect-square w-full rounded-md bg-muted object-cover"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {first ? <Badge tone="info">{COPY.main}</Badge> : null}
          {variant === null ? null : <p>{COPY.shownFor(variantShortLabel(variant))}</p>}
          {image.altText === null ? <p className="text-muted-foreground">{COPY.noDescription}</p> : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-describedby={describedBy}
              aria-label={COPY.actions(index + 1, total)}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={first}
              onSelect={() => {
                onMove('earlier');
              }}
            >
              {COPY.moveEarlier}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={last}
              onSelect={() => {
                onMove('later');
              }}
            >
              {COPY.moveLater}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={first}
              onSelect={() => {
                onMove('main');
              }}
            >
              {COPY.makeMain}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>{COPY.edit}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onRemove}>{COPY.remove}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

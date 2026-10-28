// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UI_COPY } from '../copy';
import { expectNoAxeViolations } from '../test/axe';
import { UploadTiles, type UploadTilesProps, type UploadTileView } from './upload-tiles';

const tile = (overrides: Partial<UploadTileView>): UploadTileView => ({
  key: 't1',
  fileName: 'shirt.png',
  previewUrl: 'blob:shirt',
  status: 'ready',
  progress: 100,
  message: null,
  canRetry: false,
  ...overrides,
});

function setup(props: Partial<UploadTilesProps> = {}) {
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() };
  const view = render(
    <UploadTiles
      tiles={[]}
      refusals={[]}
      announcement=""
      accept="image/jpeg,image/png,image/webp"
      canAddMore
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers, user: userEvent.setup() };
}

describe('UploadTiles (conventions §12.2)', () => {
  it('is a labelled, keyboard-reachable picker described by the limits', async () => {
    const { user, onAdd, container } = setup();
    const input = screen.getByLabelText(UI_COPY.addPhotos);
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(screen.getByText(UI_COPY.photoLimits).id).toBe(input.getAttribute('aria-describedby'));
    await user.tab();
    expect(document.activeElement).toBe(input);
    const files = [new File(['a'], 'a.png', { type: 'image/png' })];
    await user.upload(input, files);
    expect(onAdd).toHaveBeenCalledWith(files);
    await expectNoAxeViolations(container);
  });

  it('shows each state with its text, a progress bar while uploading', async () => {
    const { container } = setup({
      tiles: [
        tile({ key: 'a', fileName: 'a.png', status: 'checking' }),
        tile({ key: 'b', fileName: 'b.png', status: 'uploading', progress: 42 }),
        tile({ key: 'c', fileName: 'c.png', status: 'processing' }),
        tile({ key: 'd', fileName: 'd.png', status: 'ready' }),
      ],
    });
    expect(screen.getByText(UI_COPY.uploadChecking)).toBeDefined();
    expect(screen.getByText(UI_COPY.uploadProgress(42))).toBeDefined();
    expect(
      screen.getByRole('progressbar', { name: UI_COPY.uploadProgressOf('b.png') }).getAttribute('value'),
    ).toBe('42');
    expect(screen.getByText(UI_COPY.uploadProcessing)).toBeDefined();
    expect(screen.getByText(UI_COPY.uploadReady)).toBeDefined();
    expect(screen.getByRole('img', { name: 'd.png' }).getAttribute('src')).toBe('blob:shirt');
    await expectNoAxeViolations(container);
  });

  it('offers "Try again" only on a retryable failure, and "Remove" on every tile', async () => {
    const { user, onRetry, onRemove } = setup({
      tiles: [
        tile({
          key: 'a',
          fileName: 'a.png',
          status: 'failed',
          message: 'The upload didn’t finish.',
          canRetry: true,
        }),
        tile({ key: 'b', fileName: 'b.png', status: 'failed', message: 'Not an image.', canRetry: false }),
      ],
    });
    expect(screen.getByText('The upload didn’t finish.')).toBeDefined();
    expect(screen.queryByRole('button', { name: UI_COPY.retryUpload('b.png') })).toBeNull();
    await user.click(screen.getByRole('button', { name: UI_COPY.retryUpload('a.png') }));
    expect(onRetry).toHaveBeenCalledWith('a');
    await user.click(screen.getByRole('button', { name: UI_COPY.removeUpload('b.png') }));
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('lists the refused files under the picker', () => {
    setup({ refusals: [{ key: 'r', fileName: 'big.png', message: 'This photo is larger than 5 MB.' }] });
    expect(screen.getByText('big.png: This photo is larger than 5 MB.')).toBeDefined();
  });

  it('disables the picker at the limit', () => {
    setup({ canAddMore: false });
    expect(screen.getByLabelText<HTMLInputElement>(UI_COPY.addPhotos).disabled).toBe(true);
  });

  it('counts down a RATE_LIMITED wait on the picker', () => {
    setup({ cooldownSeconds: 12 });
    expect(screen.getByLabelText<HTMLInputElement>(UI_COPY.addPhotos).disabled).toBe(true);
    expect(screen.getByText('Too many attempts. Try again in 12 s.')).toBeDefined();
  });

  it('announces status changes politely', () => {
    setup({ announcement: 'Photo 2 of 3 ready.' });
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Photo 2 of 3 ready.');
  });
});

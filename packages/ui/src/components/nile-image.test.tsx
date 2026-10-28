// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { UI_COPY } from '../copy';
import { imageSrcSet, NileImage } from './nile-image';
import { PrivateImage } from './private-image';

const urls = (tag: string) => ({
  thumb: `https://media.test/${tag}-200.webp`,
  medium: `https://media.test/${tag}-600.webp`,
  large: `https://media.test/${tag}-1200.webp`,
});

const photo = { id: 'img-1', urls: urls('a'), width: 1200, height: 900 };

describe('NileImage (T-J3)', () => {
  it('renders the three widths with the intrinsic size, lazily', async () => {
    const { container } = render(
      <NileImage image={photo} alt="Linen shirt" sizes="50vw" placeholder="product" className="w-full" />,
    );
    const img = screen.getByRole('img', { name: 'Linen shirt' });
    expect(img.getAttribute('src')).toBe(photo.urls.medium);
    expect(img.getAttribute('srcset')).toBe(
      `${photo.urls.thumb} 200w, ${photo.urls.medium} 600w, ${photo.urls.large} 1200w`,
    );
    expect(img.getAttribute('sizes')).toBe('50vw');
    expect(img.getAttribute('width')).toBe('1200');
    expect(img.getAttribute('height')).toBe('900');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.hasAttribute('fetchpriority')).toBe(false);
    await expectNoAxeViolations(container);
  });

  it('loads the largest image of a page eagerly with high priority', () => {
    render(<NileImage image={photo} alt="Linen shirt" sizes="100vw" placeholder="product" priority />);
    const img = screen.getByRole('img', { name: 'Linen shirt' });
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('shows the brand placeholder named like the image when there is none', async () => {
    const { container } = render(
      <>
        <NileImage image={null} alt="Linen shirt" sizes="50vw" placeholder="product" className="size-40" />
        <NileImage image={null} alt="Fashion" sizes="50vw" placeholder="category" />
      </>,
    );
    expect(container.querySelector('img')).toBeNull();
    const product = screen.getByRole('img', { name: 'Linen shirt' });
    expect(product.tagName.toLowerCase()).toBe('svg');
    expect(product.getAttribute('class')).toBe('size-40');
    expect(product.getAttribute('viewBox')).toBe('0 0 800 800');
    expect(screen.getByRole('img', { name: 'Fashion' }).getAttribute('viewBox')).toBe('0 0 800 600');
    await expectNoAxeViolations(container);
  });

  it('keeps a decorative placeholder hidden', () => {
    const { container } = render(<NileImage image={null} alt="" sizes="50vw" placeholder="product" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('imageSrcSet', () => {
  it('describes each file by its real width when the original was small (never upscaled)', () => {
    expect(imageSrcSet({ urls: urls('s'), width: 450, height: 300 })).toBe(
      'https://media.test/s-200.webp 200w, https://media.test/s-600.webp 450w',
    );
  });

  it('lists one file when all three have the same width', () => {
    expect(imageSrcSet({ urls: urls('t'), width: 200, height: 200 })).toBe(
      'https://media.test/t-200.webp 200w',
    );
  });
});

describe('PrivateImage (conventions §12.1)', () => {
  it('reads the resource again once after a failed load and shows the fresh URL', () => {
    const onExpired = vi.fn();
    const { rerender } = render(
      <PrivateImage image={photo} alt="Receipt" sizes="200px" onExpired={onExpired} />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Receipt' }));
    expect(onExpired).toHaveBeenCalledTimes(1);
    // Until the new URL arrives the expired one is not tried again.
    expect(screen.getByRole('img', { name: `Receipt: ${UI_COPY.imageUnavailable}` })).toBeDefined();

    rerender(
      <PrivateImage
        image={{ ...photo, urls: urls('b') }}
        alt="Receipt"
        sizes="200px"
        onExpired={onExpired}
      />,
    );
    expect(screen.getByRole('img', { name: 'Receipt' }).getAttribute('src')).toBe(urls('b').medium);
  });

  it('shows "can\'t be shown" after the fresh URL fails too, without refetching again', () => {
    const onExpired = vi.fn();
    const { rerender } = render(
      <PrivateImage image={photo} alt="Receipt" sizes="200px" onExpired={onExpired} />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Receipt' }));
    rerender(
      <PrivateImage
        image={{ ...photo, urls: urls('b') }}
        alt="Receipt"
        sizes="200px"
        onExpired={onExpired}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Receipt' }));
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: `Receipt: ${UI_COPY.imageUnavailable}` })).toBeDefined();
    expect(document.querySelector('img')).toBeNull();
  });

  it('stays unavailable when the refetch brings the same URL', () => {
    const onExpired = vi.fn();
    const { rerender } = render(<PrivateImage image={photo} alt="" sizes="200px" onExpired={onExpired} />);
    const img = document.querySelector('img');
    if (img === null) throw new Error('no img');
    fireEvent.error(img);
    rerender(<PrivateImage image={{ ...photo }} alt="" sizes="200px" onExpired={onExpired} />);
    expect(screen.getByRole('img', { name: UI_COPY.imageUnavailable })).toBeDefined();
  });

  it('starts over for another image', () => {
    const onExpired = vi.fn();
    const { rerender } = render(
      <PrivateImage image={photo} alt="Receipt" sizes="200px" onExpired={onExpired} />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Receipt' }));
    act(() => {
      rerender(
        <PrivateImage
          image={{ id: 'img-2', urls: urls('c'), width: 600, height: 600 }}
          alt="Receipt"
          sizes="200px"
          onExpired={onExpired}
        />,
      );
    });
    fireEvent.error(screen.getByRole('img', { name: 'Receipt' }));
    expect(onExpired).toHaveBeenCalledTimes(2);
  });
});

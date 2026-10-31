// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { UI_COPY } from '../copy';
import { expectNoAxeViolations } from '../test/axe';
import { ImageGallery } from './image-gallery';
import type { LightboxImage } from './lightbox';

const photo = (id: string, alt: string): LightboxImage => ({
  id,
  alt,
  urls: {
    thumb: `https://media.test/${id}-t.webp`,
    medium: `https://media.test/${id}-m.webp`,
    large: `https://media.test/${id}-l.webp`,
  },
  width: 1200,
  height: 1200,
});

const PHOTOS = [photo('a', 'Red shirt, front'), photo('b', 'Red shirt, back'), photo('c', 'Blue shirt')];

function Harness({ initial = null }: { readonly initial?: string | null }) {
  const [active, setActive] = useState<string | null>(initial);
  return <ImageGallery images={PHOTOS} activeId={active} onActiveChange={setActive} name="Shirt" />;
}

function mainImage() {
  return screen.getByRole('button', { name: /View larger/ }).querySelector('img');
}

describe('ImageGallery (spec 01 SF-05, conventions §12.1)', () => {
  it('shows the first photo eagerly and switches with the thumbnails', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    expect(mainImage()?.getAttribute('alt')).toBe('Red shirt, front');
    expect(mainImage()?.getAttribute('loading')).toBe('eager');
    const second = screen.getByRole('button', { name: UI_COPY.showPhoto(2, 3) });
    await user.click(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(mainImage()?.getAttribute('alt')).toBe('Red shirt, back');
    await expectNoAxeViolations(container);
  });

  it('follows the active id from the caller (a chosen variant)', () => {
    render(<Harness initial="c" />);
    expect(mainImage()?.getAttribute('alt')).toBe('Blue shirt');
  });

  it('opens the lightbox on the main photo; arrows move, Escape closes and focus returns', async () => {
    const user = userEvent.setup();
    render(<Harness initial="b" />);
    const trigger = screen.getByRole('button', { name: /View larger/ });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Shirt' });
    expect(screen.getByRole('status').textContent).toBe(UI_COPY.photoOf(2, 3));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status').textContent).toBe(UI_COPY.photoOf(3, 3));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status').textContent).toBe(UI_COPY.photoOf(1, 3));
    await user.click(screen.getByRole('button', { name: UI_COPY.previousPhoto }));
    expect(screen.getByRole('status').textContent).toBe(UI_COPY.photoOf(3, 3));
    expect(dialog.querySelector('img')?.getAttribute('alt')).toBe('Blue shirt');
    await expectNoAxeViolations(dialog);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('shows the placeholder and no thumbnails without photos', () => {
    render(<ImageGallery images={[]} activeId={null} onActiveChange={() => undefined} name="Shirt" />);
    expect(screen.getByRole('img', { name: 'Shirt' }).tagName.toLowerCase()).toBe('svg');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

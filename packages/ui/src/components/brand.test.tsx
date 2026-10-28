// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryImagePlaceholder, ProductImagePlaceholder } from './image-placeholders';
import { NileLogoShort } from './logo';
import { PortalBrand } from './shell';

describe('logo (T-J2)', () => {
  it('is an image named by its label', () => {
    render(<NileLogoShort label="Nile" className="h-9 w-auto" />);
    const logo = screen.getByRole('img', { name: 'Nile' });
    expect(logo.getAttribute('class')).toBe('h-9 w-auto');
    expect(logo.getAttribute('focusable')).toBe('false');
  });

  it('is hidden from assistive technology without a label', () => {
    const { container } = render(<NileLogoShort />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the brand artwork cropped to its painted area', () => {
    const { container } = render(<NileLogoShort />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('20 20 250 112');
  });
});

describe('image placeholders (T-J2)', () => {
  it('are decorative by default and fill their box like a cropped image', () => {
    const { container } = render(
      <>
        <ProductImagePlaceholder className="size-full" />
        <CategoryImagePlaceholder className="size-full" />
      </>,
    );
    expect(screen.queryByRole('img')).toBeNull();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
    }
  });

  it('take a name when they stand alone', () => {
    render(<ProductImagePlaceholder label="Linen shirt" />);
    expect(screen.getByRole('img', { name: 'Linen shirt' })).toBeDefined();
  });
});

describe('PortalBrand', () => {
  it('reads as "Nile <portal>" inside a link', () => {
    render(
      <a href="#top">
        <PortalBrand roleLabel="Seller" />
      </a>,
    );
    expect(screen.getByRole('link', { name: 'Nile Seller' })).toBeDefined();
  });
});

describe('PortalBrand compact (phones)', () => {
  it('keeps the name "Nile <portal>" while the portal word is visible only from 640 px', () => {
    render(
      <a href="#top">
        <PortalBrand roleLabel="Admin" compact />
      </a>,
    );
    expect(screen.getByRole('link', { name: 'Nile Admin' })).toBeDefined();
    expect(screen.getByText('Admin').getAttribute('class')).toContain('sr-only sm:not-sr-only');
  });
});

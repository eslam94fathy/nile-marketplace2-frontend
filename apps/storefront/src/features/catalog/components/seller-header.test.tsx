// @vitest-environment jsdom
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SellerHeader, type PublicSeller } from './seller-header';

const SELLER: PublicSeller = {
  id: '01900000-0000-7000-8000-0000000000aa',
  businessName: 'Nile Crafts',
  ratingAvg: '4.50',
  ratingCount: 12,
  memberSince: '2026-03-14T09:00:00.000Z',
};

describe('SellerHeader (spec 01 SF-22)', () => {
  it('name as the heading, rating, "Selling on Nile since {Month YYYY}"', () => {
    renderWithProviders(<SellerHeader seller={SELLER} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Nile Crafts' })).toBeDefined();
    expect(screen.getByText('Selling on Nile since March 2026')).toBeDefined();
    expect(screen.queryByText('No reviews yet')).toBeNull();
  });

  it('without reviews: "No reviews yet"', () => {
    renderWithProviders(<SellerHeader seller={{ ...SELLER, ratingAvg: null, ratingCount: 0 }} />);
    expect(screen.getByText('No reviews yet')).toBeDefined();
  });
});

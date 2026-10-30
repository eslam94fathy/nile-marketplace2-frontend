// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UI_COPY } from '../copy';
import { expectNoAxeViolations } from '../test/axe';
import { RatingStars } from './rating-stars';

describe('RatingStars (conventions §12.8)', () => {
  it('shows the API average with one decimal and the count, read as a sentence', async () => {
    const { container } = render(<RatingStars avg="4.30" count={12} />);
    expect(screen.getByText('Rated 4.3 out of 5 from 12 reviews')).toBeDefined();
    expect(screen.getByText('4.3 (12 reviews)').getAttribute('aria-hidden')).toBe('true');
    await expectNoAxeViolations(container);
  });

  it('uses the singular for one review', () => {
    render(<RatingStars avg="5.00" count={1} />);
    expect(screen.getByText('Rated 5.0 out of 5 from 1 review')).toBeDefined();
  });

  it('shows "No reviews yet" without stars when there are none', () => {
    const { container } = render(<RatingStars avg={null} count={0} />);
    expect(screen.getByText(UI_COPY.noReviewsYet)).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });
});

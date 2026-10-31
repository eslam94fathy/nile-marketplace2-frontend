// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { RatingInput } from './rating-input';

function Harness({ error }: { readonly error?: string }) {
  const [value, setValue] = useState<number | null>(null);
  return <RatingInput legend="Rating" value={value} onChange={setValue} error={error} required />;
}

describe('RatingInput (conventions §12.8)', () => {
  it('is a labelled group of five radios, "1 star" … "5 stars", chosen by click or arrow keys', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const group = screen.getByRole('group', { name: /Rating/ });
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('id') !== null)).toHaveLength(5);
    await user.click(screen.getByRole('radio', { name: '3 stars' }));
    expect(screen.getByRole('radio', { name: '3 stars' })).toHaveProperty('checked', true);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '4 stars' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: '1 star' })).toBeDefined();
    expect(group.getAttribute('aria-invalid')).toBe('false');
    await expectNoAxeViolations(container);
  });

  it('shows the error and links it to the group', () => {
    render(<Harness error="Choose a rating." />);
    const group = screen.getByRole('group', { name: /Rating/ });
    expect(group.getAttribute('aria-invalid')).toBe('true');
    const message = screen.getByText('Choose a rating.');
    expect(group.getAttribute('aria-describedby')).toBe(message.id);
  });
});

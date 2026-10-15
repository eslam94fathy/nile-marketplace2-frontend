// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { Overview } from './overview';

const server = setupMswServer();

function serve(status: Schema<'SellerProfileDto'>['status']) {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

describe('overview, T-H1 part (spec 02 SE-06)', () => {
  it('approved: "Add product" links to the new-product page; no checklist', async () => {
    serve('approved');
    renderWithProviders(<Overview />);
    const add = await screen.findByRole('link', { name: 'Add product' });
    expect(add.getAttribute('href')).toBe('/products/new');
    expect(screen.getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe('/orders');
    expect(screen.getByRole('link', { name: 'Products' }).getAttribute('href')).toBe('/products');
    expect(screen.queryByRole('list', { name: 'Application progress' })).toBeNull();
  });

  it('pending approval: the checklist, and "Add product" disabled with the reason', async () => {
    serve('pending_approval');
    renderWithProviders(<Overview />);
    const checklist = await screen.findByRole('list', { name: 'Application progress' });
    expect(within(checklist).getByText('Email verified')).toBeDefined();
    expect(within(checklist).getByText('Waiting for admin review')).toBeDefined();
    const add = screen.getByRole('button', { name: 'Add product' });
    expect(add).toHaveProperty('disabled', true);
    expect(add.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      "Your account is waiting for approval. You can add products once you're approved.",
    );
  });

  it.each(['rejected', 'suspended'] as const)('%s: "Add product" disabled; no checklist', async (status) => {
    serve(status);
    renderWithProviders(<Overview />);
    await screen.findByText(status === 'rejected' ? /application was rejected/ : /account is suspended/);
    expect(screen.getByRole('button', { name: 'Add product' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('list', { name: 'Application progress' })).toBeNull();
  });

  it('while the profile loads, "Add product" stays disabled', () => {
    serve('approved');
    renderWithProviders(<Overview />);
    expect(screen.getByRole('button', { name: 'Add product' })).toHaveProperty('disabled', true);
  });
});

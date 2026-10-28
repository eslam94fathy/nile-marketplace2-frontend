import { describe, expect, it } from 'vitest';
import { MANIFEST_ICONS, webAppManifest } from './manifest';

describe('webAppManifest (design 01 §15.5)', () => {
  it('standalone from the root, with the brand colours and the three icons', () => {
    expect(webAppManifest('Nile Seller')).toEqual({
      name: 'Nile Seller',
      short_name: 'Nile Seller',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#FFFFFF',
      theme_color: '#0E2A3B',
      icons: [...MANIFEST_ICONS],
    });
  });
});

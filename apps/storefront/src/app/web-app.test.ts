import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANIFEST_ICONS } from '@nile/ui/manifest';

// The installable-app files this app serves (design 01 §15.5).

const PUBLIC = new URL('../../public/', import.meta.url);

describe('web app files', () => {
  it('public/sw.js is the reviewed service worker of @nile/notifications, unchanged', () => {
    const source = readFileSync(
      new URL(import.meta.resolve('@nile/notifications/service-worker.js')),
      'utf8',
    );
    expect(readFileSync(new URL('sw.js', PUBLIC), 'utf8')).toBe(source);
  });

  it.each(MANIFEST_ICONS.map((icon) => icon.src))('the manifest icon %s exists', (src) => {
    expect(existsSync(new URL(`.${src}`, PUBLIC))).toBe(true);
  });
});

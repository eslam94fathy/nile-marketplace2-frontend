// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getQueryClient } from './query-client';

describe('getQueryClient in the browser', () => {
  it('returns one client for the page lifetime', () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });
});

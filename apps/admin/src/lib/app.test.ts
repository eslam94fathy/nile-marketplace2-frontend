import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP } from './app';

interface PackageJson {
  name: string;
  scripts: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageJson;

describe('app identity', () => {
  it('matches its workspace package name', () => {
    expect(pkg.name).toBe(`@nile/${APP.name}`);
  });

  it.each(['dev', 'start'])('runs "%s" on the app port', (script) => {
    expect(pkg.scripts[script]).toContain(`--port ${APP.devPort}`);
  });
});

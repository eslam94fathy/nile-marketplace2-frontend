import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface TsConfig {
  compilerOptions: Record<string, unknown>;
}

const base = JSON.parse(readFileSync(new URL('../tsconfig/base.json', import.meta.url), 'utf8')) as TsConfig;

// CLAUDE.md §10: these flags are binding for every workspace.
const REQUIRED_FLAGS = [
  'strict',
  'noUncheckedIndexedAccess',
  'noImplicitOverride',
  'exactOptionalPropertyTypes',
  'useUnknownInCatchVariables',
  'noFallthroughCasesInSwitch',
] as const;

describe('base tsconfig', () => {
  it.each(REQUIRED_FLAGS)('enables %s', (flag) => {
    expect(base.compilerOptions[flag]).toBe(true);
  });
});

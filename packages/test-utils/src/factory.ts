import type { Schema } from '@nile/api';
import type { components } from '@nile/api/schema';

type SchemaName = keyof components['schemas'];

/** Builds a valid DTO; `sequence` (1, 2, 3, …) makes ids, slugs and emails unique within a test run. */
export type FactoryBuild<Name extends SchemaName> = (sequence: number) => Schema<Name>;

export type Factory<Name extends SchemaName> = (overrides?: Partial<Schema<Name>>) => Schema<Name>;

/**
 * A typed DTO factory: defaults come from `build`, a test overrides only what it is about. The result is
 * typed by the generated schema, so a contract change breaks the factory at compile time.
 * Factories live next to the first tests that need them (T-B7 decision: no unused factories).
 */
export function defineFactory<Name extends SchemaName>(build: FactoryBuild<Name>): Factory<Name> {
  let sequence = 0;
  return (overrides = {}) => {
    sequence += 1;
    return { ...build(sequence), ...overrides };
  };
}

/** A deterministic UUID v7-shaped id for fixtures (`fixtureId(3)` → `…-7000-8000-000000000003`). */
export function fixtureId(sequence: number): string {
  const tail = sequence.toString(16).padStart(12, '0');
  return `01900000-0000-7000-8000-${tail}`;
}

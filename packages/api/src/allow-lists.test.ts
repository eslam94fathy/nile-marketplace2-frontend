import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFixes, type OpenApiDocument } from '../scripts/openapi-fix.ts';
import { SNAPSHOT_FILE } from '../scripts/paths.ts';
import { BFF_ALLOW_LISTS, BFF_APPS, type AllowedOperation } from './allow-lists';
import { API_PREFIX } from './transports';

const DESIGN_FILE = resolve(import.meta.dirname, '../../../docs/frontend/design/02-data-layer.md');

/** Operations no proxy may forward (design 02 §1): token-bearing auth calls and the webhook. */
const NEVER_PROXIED = [
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/email/verify',
  'POST /auth/invite/accept',
  'POST /auth/password/change',
  'POST /webhooks/kashier',
];

const describeOp = (o: Pick<AllowedOperation, 'method' | 'path'>) => `${o.method} ${o.path}`;
const row = (o: AllowedOperation) => `${describeOp(o)} ${o.auth}${o.idempotencyKey ? ' idem' : ''}`;

function designTables(): Record<string, string[]> {
  const tables: Record<string, string[]> = {};
  let app: string | null = null;
  for (const line of readFileSync(DESIGN_FILE, 'utf8').split('\n')) {
    const heading = /^#### (\w+) \(/.exec(line);
    if (heading?.[1] !== undefined) {
      app = heading[1];
      tables[app] = [];
      continue;
    }
    if (line.startsWith('## ')) app = null;
    const cells = /^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \| ([^|]+) \| ([^|]+) \|/.exec(line);
    if (app === null || !cells) continue;
    const [, method, path, session = '', idem = ''] = cells;
    tables[app]?.push(
      `${method} ${path} ${session.includes('Bearer') ? 'bearer' : 'public'}${idem.includes('required') ? ' idem' : ''}`,
    );
  }
  return tables;
}

const document: OpenApiDocument = applyFixes(
  JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as OpenApiDocument,
).document;

function operation(o: Pick<AllowedOperation, 'method' | 'path'>) {
  return document.paths?.[`${API_PREFIX}${o.path}`]?.[o.method.toLowerCase()];
}

describe('BFF allow-lists', () => {
  it('equal the design 02 §1 tables, app by app and row by row', () => {
    const tables = designTables();
    expect(Object.keys(tables)).toEqual([...BFF_APPS]);
    for (const app of BFF_APPS) {
      expect(BFF_ALLOW_LISTS[app].map(row), app).toEqual(tables[app]);
    }
  });

  it.each(BFF_APPS)('%s: every operation exists with the same session and Idempotency-Key rules', (app) => {
    for (const allowed of BFF_ALLOW_LISTS[app]) {
      const found = operation(allowed);
      expect(found, describeOp(allowed)).toBeDefined();
      const bearer = Array.isArray(found?.security) && found.security.length > 0;
      expect(bearer ? 'bearer' : 'public', describeOp(allowed)).toBe(allowed.auth);
      const idem = (found?.parameters ?? []).some(
        (p) => p.in === 'header' && p.name === 'Idempotency-Key' && p.required === true,
      );
      expect(idem, describeOp(allowed)).toBe(allowed.idempotencyKey);
    }
  });

  it('has no duplicates within an app', () => {
    for (const app of BFF_APPS) {
      const ops = BFF_ALLOW_LISTS[app].map(describeOp);
      expect(new Set(ops).size, app).toBe(ops.length);
    }
  });

  it('never exposes the token-bearing auth calls or the webhook', () => {
    for (const app of BFF_APPS) {
      for (const allowed of BFF_ALLOW_LISTS[app]) {
        expect(NEVER_PROXIED, app).not.toContain(describeOp(allowed));
      }
    }
  });

  it('covers every documented operation except the never-proxied ones', () => {
    const allowed = new Set(BFF_APPS.flatMap((app) => BFF_ALLOW_LISTS[app].map(describeOp)));
    const missing: string[] = [];
    for (const [fullPath, item] of Object.entries(document.paths ?? {})) {
      // Health checks (`/health/*`) live outside /api/v1, which is all the BFF can forward.
      if (!fullPath.startsWith(`${API_PREFIX}/`)) continue;
      const path = fullPath.slice(API_PREFIX.length);
      for (const method of Object.keys(item)) {
        const op = `${method.toUpperCase()} ${path}`;
        if (!allowed.has(op) && !NEVER_PROXIED.includes(op)) missing.push(op);
      }
    }
    expect(missing).toEqual([]);
  });

  it('types path parameters as uuid, except the product idOrSlug', () => {
    for (const app of BFF_APPS) {
      for (const allowed of BFF_ALLOW_LISTS[app]) {
        for (const parameter of operation(allowed)?.parameters ?? []) {
          if (parameter.in !== 'path') continue;
          const expected = parameter.name === 'idOrSlug' ? undefined : 'uuid';
          expect(parameter.schema?.format, `${describeOp(allowed)} {${String(parameter.name)}}`).toBe(
            expected,
          );
        }
      }
    }
  });
});

import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');

/** Pinned OpenAPI document, pretty-printed exactly as `api:pull` wrote it (its sha256 is in the lock file). */
export const SNAPSHOT_FILE = resolve(packageRoot, 'openapi', 'nile.openapi.json');
/** `{ repo, commit, openapiSha256 }`: the backend version every contract artefact targets (design 01 §12.2). */
export const LOCK_FILE = resolve(repoRoot, 'backend.lock.json');
/** Output of `api:gen`; never edited by hand. */
export const GENERATED_FILE = resolve(packageRoot, 'src', 'generated', 'schema.d.ts');

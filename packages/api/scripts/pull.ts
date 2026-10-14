// `npm run api:pull -w @nile/api -- --commit <backend sha>`: fetches the OpenAPI document from a running backend
// (NILE_API_BASE_URL, docs enabled) and pins it: the snapshot is stored pretty-printed and backend.lock.json
// records the backend commit and the snapshot's sha256 (design 01 §12.2). Regenerate types afterwards.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { LOCK_FILE, SNAPSHOT_FILE } from './paths.ts';

const OPENAPI_PATH = '/api/v1/docs/openapi.json';
const BACKEND_REPO = 'eslam94fathy/nile-marketplace2';
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function fail(message: string): never {
  process.stderr.write(`api:pull: ${message}\n`);
  process.exit(1);
}

const baseUrl = process.env.NILE_API_BASE_URL;
if (!baseUrl) fail('set NILE_API_BASE_URL to the backend origin, e.g. http://localhost:3100');

const commitIndex = process.argv.indexOf('--commit');
const commit = commitIndex === -1 ? undefined : process.argv[commitIndex + 1];
if (!commit || !COMMIT_PATTERN.test(commit)) {
  fail('pass --commit <full 40-character sha> of the backend commit that is running');
}

const response = await fetch(new URL(OPENAPI_PATH, baseUrl));
if (!response.ok) fail(`GET ${OPENAPI_PATH} answered ${response.status} (is API_DOCS_ENABLED=true?)`);
const document: unknown = await response.json();
if (typeof document !== 'object' || document === null || !('openapi' in document)) {
  fail('the response is not an OpenAPI document');
}

const snapshot = `${JSON.stringify(document, null, 2)}\n`;
const sha256 = createHash('sha256').update(snapshot).digest('hex');
writeFileSync(SNAPSHOT_FILE, snapshot, 'utf8');
writeFileSync(
  LOCK_FILE,
  `${JSON.stringify({ repo: BACKEND_REPO, commit, openapiSha256: sha256 }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`api:pull: snapshot pinned to ${commit.slice(0, 7)} (sha256 ${sha256.slice(0, 16)}…)\n`);

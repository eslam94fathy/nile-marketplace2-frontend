// `npm run audit`: fails on high/critical advisories in any dependency (runtime and dev), except advisories
// listed in audit-exceptions.json with a reason and a review date. An exception past its review date fails
// the audit too, so every exception is re-checked instead of silently living forever.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BLOCKING = new Set(['high', 'critical']);
const root = resolve(import.meta.dirname, '..');
const exceptions = JSON.parse(readFileSync(resolve(root, 'audit-exceptions.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

// Run npm's own CLI with Node and an argument array: no shell, works on every OS. `npm run` sets npm_execpath.
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this through npm: npm run audit');
  process.exit(1);
}

let report;
try {
  report = execFileSync(process.execPath, [npmCli, 'audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

// Collect the underlying advisories (the `via` entries that are objects, not package names).
const advisories = new Map();
for (const vuln of Object.values(vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split('/').pop() ?? String(via.source);
    advisories.set(id, { id, pkg: via.name, title: via.title, severity: via.severity });
  }
}

let failed = false;
for (const advisory of advisories.values()) {
  const exception = exceptions.find((e) => e.advisory === advisory.id);
  if (!exception) {
    failed = true;
    console.error(`FAIL ${advisory.severity} ${advisory.id} (${advisory.pkg}): ${advisory.title}`);
  } else if (exception.reviewBy < today) {
    failed = true;
    console.error(
      `FAIL exception for ${advisory.id} expired on ${exception.reviewBy}; re-check and renew or remove it.`,
    );
  } else {
    console.log(`allowed ${advisory.id} (${advisory.pkg}) until ${exception.reviewBy}: ${exception.reason}`);
  }
}

for (const exception of exceptions) {
  if (!advisories.has(exception.advisory)) {
    console.log(`note: exception ${exception.advisory} no longer matches any finding; remove it.`);
  }
}

if (failed) process.exit(1);
console.log(`audit ok: ${advisories.size} blocking advisories, all covered by current exceptions.`);

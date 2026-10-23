// `npm run dev`: starts every app's dev server in parallel with prefixed output (no extra dependency).
// One app only: `npm run dev -w @nile/storefront`.
import { spawn, spawnSync } from 'node:child_process';

const APPS = ['storefront', 'seller', 'admin', 'agent'];
const isWindows = process.platform === 'win32';
const npmCli = process.env.npm_execpath; // set by `npm run`
if (!npmCli) {
  console.error('Run this through npm: npm run dev');
  process.exit(1);
}

const children = APPS.map((app) => {
  // npm's own CLI run by Node with an argument array: no shell. Outside Windows a separate process group
  // lets us stop the whole tree.
  const child = spawn(process.execPath, [npmCli, 'run', 'dev', '-w', `@nile/${app}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
  });
  const prefix = `[${app}] `;
  const relay = (stream, target) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line) target.write(`${prefix}${line}\n`);
    });
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => process.stdout.write(`${prefix}exited with code ${code}\n`));
  return child;
});

// child.kill() would end only the shell/npm wrapper and leave `next dev` running, so kill each process tree.
function stopTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) stopTree(child);
  process.exit(0);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
process.on('SIGHUP', stopAll);

// `npm run dev:stop`: stops dev servers left running on the app ports, e.g. after the `npm run dev` launcher
// was killed hard (IDE stop button), which no signal handler can intercept. Only processes whose command
// line points into this repository are stopped; anything else on these ports is reported and left alone.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const PORTS = [4100, 4101, 4102, 4103];
const repoRoot = resolve(import.meta.dirname, '..').toLowerCase();
const isWindows = process.platform === 'win32';

function listenersWindows() {
  const script = `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { @(${PORTS.join(',')}) -contains $_.LocalPort } | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"; "$($_.LocalPort)\`t$($_.OwningProcess)\`t$($p.ParentProcessId)\`t$($p.CommandLine)" }`;
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [port, pid, parentPid, ...cmd] = line.split('\t');
      return { port: Number(port), pid: Number(pid), parentPid: Number(parentPid), cmd: cmd.join('\t') };
    });
}

function listenersUnix() {
  const found = [];
  for (const port of PORTS) {
    let pids = '';
    try {
      pids = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    } catch {
      continue; // nothing listening
    }
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      const cmd = execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).trim();
      found.push({ port, pid: Number(pid), parentPid: undefined, cmd });
    }
  }
  return found;
}

const listeners = isWindows ? listenersWindows() : listenersUnix();
if (listeners.length === 0) {
  console.log('No dev servers running on ports', PORTS.join(', '));
  process.exit(0);
}

for (const { port, pid, parentPid, cmd } of listeners) {
  if (!cmd.toLowerCase().includes(repoRoot)) {
    console.log(`Port ${port}: process ${pid} is not from this repository; left running.`);
    continue;
  }
  if (isWindows) {
    // Stop the `next dev` parent too, so it can't restart its server.
    const target = parentPid && parentPid > 0 ? parentPid : pid;
    try {
      execFileSync('taskkill', ['/PID', String(target), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    }
  } else {
    process.kill(pid, 'SIGTERM');
  }
  console.log(`Port ${port}: stopped process ${pid}.`);
}

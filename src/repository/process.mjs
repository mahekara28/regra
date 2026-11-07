import { spawn } from 'node:child_process';
import path from 'node:path';

// Environment hygiene, not a security boundary for trusted host processes.
export function runtimeEnvironment() {
  const allowed = /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => allowed.test(name)));
}
function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    killer.on('close', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}
export function runProcess(command, args, { cwd, input, timeoutMs = 30000, maxBytes = 2_000_000, env = runtimeEnvironment() } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    let bytes = 0, timedOut = false, outputLimit = false, error = null;
    const timer = setTimeout(() => { timedOut = true; stopTree(child); }, timeoutMs);
    const capture = chunks => chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { if (!outputLimit) { outputLimit = true; stopTree(child); } return; }
      chunks.push(chunk);
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    child.on('error', failure => { error = failure.message; });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut, outputLimit, error, durationMs: Date.now() - started, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

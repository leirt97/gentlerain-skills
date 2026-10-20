// Child-process execution and machine-wide recursion guard.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const KILL_GRACE_MS = 5000;

// Directories GUI apps often leave out of PATH; peer CLIs need git, rg, node...
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')];

export function childEnv(overrides, depth) {
  const env = { ...process.env };
  const path = (env.PATH ?? '').split(':').filter(Boolean);
  env.PATH = [...path, ...EXTRA_PATH.filter((p) => !path.includes(p))].join(':');
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  env.AGENT_BRIDGE_DEPTH = String(depth);
  return env;
}

/**
 * Runs one CLI invocation. Resolves with stdout/stderr/exit info; rejects only
 * when the process cannot start, times out, or is cancelled.
 */
export function runProcess({ command, args, env, cwd, stdin }, { timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    // detached → own process group, so killing it also stops grandchildren
    // (tools the peer agent launched).
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stopReason = null;

    const stop = (reason) => {
      if (stopReason || child.exitCode !== null) return;
      stopReason = reason;
      const killGroup = (sig) => {
        try {
          process.kill(-child.pid, sig);
        } catch {
          /* already gone */
        }
      };
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref();
    };

    const timer = setTimeout(() => stop(`timed out after ${timeoutMs} ms`), timeoutMs);
    const onAbort = () => stop('cancelled by caller');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) stop(`stdout exceeded ${MAX_OUTPUT_BYTES} bytes`);
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`failed to start ${command}: ${error.message}`, { cause: error }));
    });
    child.on('close', (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const result = {
        code,
        signal: sig,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (stopReason) reject(Object.assign(new Error(stopReason), result));
      else resolve(result);
    });

    child.stdin.on('error', () => {}); // child may exit before reading stdin
    child.stdin.end(stdin ?? '');
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Tracks bridge calls in flight across every agent on this machine.
 *
 * Peer apps may sanitize the environment they give MCP servers (DeepSeek
 * Harness does), so AGENT_BRIDGE_DEPTH cannot be trusted to propagate through
 * A → B → A chains. A ping-pong chain needs one in-flight call per hop, so
 * capping concurrent calls also caps recursion depth.
 */
export class InflightLedger {
  constructor(dir, maxInflight, staleAfterMs) {
    this.dir = dir;
    this.maxInflight = maxInflight;
    this.staleAfterMs = staleAfterMs;
    mkdirSync(dir, { recursive: true });
  }

  live() {
    const entries = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const path = join(this.dir, file);
      let entry;
      try {
        entry = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        continue; // concurrently written or removed
      }
      const stale = !isAlive(entry.pid) || Date.now() - entry.startedAt > this.staleAfterMs;
      if (stale) rmSync(path, { force: true });
      else entries.push(entry);
    }
    return entries.sort((a, b) => a.startedAt - b.startedAt); // oldest first reads as the call chain
  }

  /** Returns a release function, or throws when the cap is reached. */
  acquire(from, to) {
    const live = this.live();
    if (live.length >= this.maxInflight) {
      const chain = live.map((e) => `${e.from}→${e.to}`).join(', ');
      throw new Error(
        `agent-bridge refused: ${live.length} bridge calls already in flight (${chain}); ` +
          `limit is ${this.maxInflight}. Answer with what you have instead of delegating further.`,
      );
    }
    const path = join(this.dir, `${process.pid}-${randomUUID()}.json`);
    writeFileSync(path, JSON.stringify({ pid: process.pid, from, to, startedAt: Date.now() }));
    return () => rmSync(path, { force: true });
  }
}

const LOCK_POLL_MS = 2000;

/**
 * Machine-wide mutex for jobs that drive the shared desktop: two agents
 * clicking at once would steal each other's focus. Waiters poll until the
 * holder releases, dies, or goes stale.
 */
export class DesktopLock {
  constructor(path, staleAfterMs) {
    this.path = path;
    this.staleAfterMs = staleAfterMs;
  }

  #tryTake(owner) {
    try {
      writeFileSync(this.path, JSON.stringify({ pid: process.pid, ...owner, startedAt: Date.now() }), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let holder;
    try {
      holder = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return false; // being written or released right now; retry next poll
    }
    if (!isAlive(holder.pid) || Date.now() - holder.startedAt > this.staleAfterMs) {
      rmSync(this.path, { force: true });
      return this.#tryTake(owner);
    }
    return false;
  }

  /** Resolves with a release function once the lock is held. */
  async acquire(owner, { timeoutMs, signal, onWait }) {
    const deadline = Date.now() + timeoutMs;
    let notified = false;
    while (!this.#tryTake(owner)) {
      if (signal?.aborted) throw new Error('cancelled while waiting for the desktop lock');
      if (Date.now() > deadline) throw new Error(`desktop lock still held after ${timeoutMs} ms (${this.path})`);
      if (!notified) {
        onWait?.();
        notified = true;
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      rmSync(this.path, { force: true });
    };
  }
}

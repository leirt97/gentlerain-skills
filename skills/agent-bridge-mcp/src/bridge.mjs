// One bridge call: frame the prompt, run the peer's CLI, parse its reply.
// Shared by the MCP server (synchronous tool calls) and the CLI (background
// jobs whose exit wakes the calling session).
//
// Environment:
//   AGENT_BRIDGE_TIMEOUT_MS    per-call timeout, default 900000 (15 min)
//   AGENT_BRIDGE_MAX_DEPTH     max nesting when the depth env var propagates, default 2
//   AGENT_BRIDGE_MAX_INFLIGHT  max concurrent bridge calls machine-wide, default 3
//   AGENT_BRIDGE_STATE_DIR     ledger directory, default ~/.agent-bridge
//   ZCODE_CLI / DSH_CLI / CLAUDE_CLI   override CLI locations

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { AGENTS } from './agents.mjs';
import { InflightLedger, childEnv, runProcess } from './run.mjs';

const OUTPUT_TAIL_CHARS = 2000;

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return value;
}

export const timeoutMs = intEnv('AGENT_BRIDGE_TIMEOUT_MS', 900_000);
const maxDepth = intEnv('AGENT_BRIDGE_MAX_DEPTH', 2);
const depth = intEnv('AGENT_BRIDGE_DEPTH', 0);
let ledger; // created lazily so importing this module has no side effects

function getLedger() {
  ledger ??= new InflightLedger(
    join(process.env.AGENT_BRIDGE_STATE_DIR ?? join(homedir(), '.agent-bridge'), 'inflight'),
    intEnv('AGENT_BRIDGE_MAX_INFLIGHT', 3),
    timeoutMs + 60_000,
  );
  return ledger;
}

// Tells the receiving agent who is asking, so it answers rather than acts on
// its own user's behalf, and knows its final message is the whole reply.
function framePrompt(caller, target, prompt) {
  return (
    `[agent-bridge] Message from the ${AGENTS[caller]?.displayName ?? 'another'} agent, forwarded to you (${AGENTS[target].displayName}). ` +
    `Your final message is returned to it verbatim as your reply.\n\n${prompt}`
  );
}

function resolveCwd(cwd) {
  const dir = cwd ?? process.cwd();
  if (!isAbsolute(dir)) throw new Error(`cwd must be an absolute path, got "${dir}"`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`cwd is not a directory: ${dir}`);
  return dir;
}

/**
 * Sends `prompt` to `target` and waits for its final reply.
 * @returns {Promise<{ reply: string, sessionId: string | null, durationMs: number }>}
 * @throws Error with the CLI's output tail when the call cannot complete.
 */
export async function askAgent({ caller, target, prompt, sessionId, cwd, access = 'read-only', model, signal }) {
  const adapter = AGENTS[target];
  if (!adapter) throw new Error(`unknown agent "${target}"; expected one of ${Object.keys(AGENTS).join(', ')}`);
  if (target === caller) throw new Error(`refusing to forward ${caller} to itself`);
  if (depth >= maxDepth) {
    throw new Error(`nesting depth ${depth} reached AGENT_BRIDGE_MAX_DEPTH=${maxDepth}; answer directly instead.`);
  }
  const release = getLedger().acquire(caller, target);
  const started = Date.now();
  try {
    const invocation = adapter.build({
      prompt: framePrompt(caller, target, prompt),
      sessionId,
      cwd: resolveCwd(cwd),
      access,
      model,
    });
    invocation.env = childEnv(invocation.env, depth + 1);
    let result;
    try {
      result = await runProcess(invocation, { timeoutMs, signal });
    } catch (error) {
      const tail = error.stderr ? `\n${error.stderr.slice(-OUTPUT_TAIL_CHARS)}` : '';
      throw new Error(`${error.message}${tail}`, { cause: error });
    }
    if (result.code !== 0) {
      const tail = (result.stderr || result.stdout).slice(-OUTPUT_TAIL_CHARS);
      throw new Error(`${adapter.displayName} exited with code ${result.code}${result.signal ? ` (${result.signal})` : ''}\n${tail}`);
    }
    return { ...adapter.parse(result.stdout), durationMs: Date.now() - started };
  } finally {
    release();
  }
}

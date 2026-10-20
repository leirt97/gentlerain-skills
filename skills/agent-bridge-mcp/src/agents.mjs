// Adapters for each peer agent's headless CLI.
// Each adapter turns a bridge request into one CLI invocation and parses the
// CLI's machine-readable output back into { reply, sessionId }.

import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const ACCESS_LEVELS = ['read-only', 'workspace-write'];

const ZCODE_RESOURCES = '/Applications/ZCode.app/Contents/Resources';

function which(bin) {
  try {
    return execFileSync('/usr/bin/which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function firstExisting(candidates) {
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

function requirePath(label, path, hint) {
  if (!path) throw new Error(`${label} not found; ${hint}`);
  return path;
}

// Parses CLI JSON output, keeping the raw text in the error so callers can see
// what the CLI actually printed.
function parseJson(label, stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} printed non-JSON output: ${stdout.slice(0, 500)}`, { cause: error });
  }
}

const zcode = {
  name: 'zcode',
  displayName: 'ZCode',
  description:
    'Ask the ZCode coding agent (Z.ai, uses the model ZCode has selected). ' +
    'Returns its final reply and a session_id you can pass back to continue the same conversation.',
  supportsModel: false,
  resolve() {
    const cli = requirePath(
      'ZCode CLI',
      firstExisting([process.env.ZCODE_CLI, join(ZCODE_RESOURCES, 'glm/zcode.cjs')]),
      'install ZCode.app or set ZCODE_CLI to zcode.cjs',
    );
    // The bundled zcode.cjs looks for this file relative to a packaging layout
    // that ZCode.app does not have, so we point it at the app's copy explicitly.
    const builtinConfig =
      process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE ??
      firstExisting([join(ZCODE_RESOURCES, 'config/provider/zcode-builtin.json')]);
    return { cli, builtinConfig };
  },
  build({ prompt, sessionId, cwd, access }) {
    const { cli, builtinConfig } = this.resolve();
    // ZCode modes: plan = read-only planning, edit = may edit files.
    const mode = access === 'workspace-write' ? 'edit' : 'plan';
    const args = [cli, '-p', prompt, '--json', '--mode', mode, '--cwd', cwd];
    if (sessionId) args.push('--resume', sessionId);
    const env = builtinConfig ? { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinConfig } : {};
    return { command: process.execPath, args, env, cwd };
  },
  parse(stdout) {
    const out = parseJson('ZCode', stdout);
    if (typeof out.response !== 'string') {
      throw new Error(`ZCode returned no response: ${stdout.slice(0, 500)}`);
    }
    return { reply: out.response, sessionId: out.sessionId ?? null };
  },
};

const dsh = {
  name: 'dsh',
  displayName: 'DeepSeek Harness',
  description:
    'Ask the DeepSeek Harness (dsh) coding agent (uses the headless profile default model). ' +
    'Returns its final reply and a session_id you can pass back to continue the same conversation.',
  supportsModel: false,
  resolve() {
    const launcher = firstExisting([
      process.env.DSH_CLI,
      which('dsh'),
      join(dirname(process.execPath), 'dsh'),
    ]);
    // dsh is a `#!/usr/bin/env node` script; run its real file with our own node
    // so it works even when the parent app's PATH has no node.
    return requirePath('dsh CLI', launcher && realpathSync(launcher), 'install @deepseek-ai/dsh or set DSH_CLI');
  },
  build({ prompt, sessionId, cwd, access }) {
    const cli = this.resolve();
    const args = [cli, '--profile', 'headless', '--json'];
    if (sessionId) args.push('--session-id', sessionId);
    args.push('-'); // read the task from stdin so prompts starting with "-" stay literal
    return { command: process.execPath, args, env: { DSH_PERMISSION_MODE: access }, cwd, stdin: prompt };
  },
  parse(stdout) {
    let sessionId = null;
    let reply = null;
    const errors = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // dsh keeps diagnostics on stderr; tolerate stray lines
      }
      if (event.type === 'session') sessionId = event.sessionId ?? sessionId;
      else if (event.type === 'final') reply = event.text ?? '';
      else if (event.type === 'error') errors.push(event.message ?? JSON.stringify(event));
    }
    if (reply === null) {
      throw new Error(`dsh produced no final message${errors.length ? `: ${errors.join('; ')}` : ''}`);
    }
    return { reply, sessionId };
  },
};

const claude = {
  name: 'claude',
  displayName: 'Claude Code',
  description:
    'Ask the Claude Code agent. Optional `model` (e.g. sonnet, opus, haiku). ' +
    'Returns its final reply and a session_id you can pass back to continue the same conversation.',
  supportsModel: true,
  resolve() {
    return requirePath(
      'claude CLI',
      firstExisting([process.env.CLAUDE_CLI, which('claude'), join(homedir(), '.local/bin/claude')]),
      'install Claude Code or set CLAUDE_CLI',
    );
  },
  build({ prompt, sessionId, cwd, access, model }) {
    const permissionMode = access === 'workspace-write' ? 'acceptEdits' : 'plan';
    const args = ['-p', '--output-format', 'json', '--permission-mode', permissionMode];
    if (model) args.push('--model', model);
    if (sessionId) args.push('--resume', sessionId);
    // CLAUDECODE marks "running inside Claude Code"; the child is a separate session.
    return { command: this.resolve(), args, env: { CLAUDECODE: undefined }, cwd, stdin: prompt };
  },
  parse(stdout) {
    const out = parseJson('Claude Code', stdout);
    if (out.is_error || typeof out.result !== 'string') {
      throw new Error(`Claude Code failed (${out.subtype ?? 'unknown'}): ${String(out.result ?? '').slice(0, 500)}`);
    }
    return { reply: out.result, sessionId: out.session_id ?? null };
  },
};

export const AGENTS = { claude, zcode, dsh };

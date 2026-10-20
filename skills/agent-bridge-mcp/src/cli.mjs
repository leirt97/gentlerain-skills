#!/usr/bin/env node
// Command-line entry for one bridge call. Meant to be run as a background job
// by the calling agent: when the peer finishes, this process exits and the
// caller's harness (e.g. Claude desktop's background Bash) wakes it with the
// output below.
//
//   node src/cli.mjs <zcode|dsh|claude> [options] [--] <prompt | ->
//     --session <id>   continue an earlier conversation
//     --cwd <dir>      absolute working directory (default: current directory)
//     --access <lvl>   read-only (default) | workspace-write | operate (L2: GUI + commands, one at a time)
//     --model <name>   model, for agents that accept one (claude)
//     --from <agent>   who is asking (default: claude)
//
// stdout: the reply, then a trailer with agent, session_id and duration.
// Exit code 0 on success; 1 with the error on stderr otherwise.

import { parseArgs } from 'node:util';
import { ACCESS_LEVELS } from './agents.mjs';
import { askAgent } from './bridge.mjs';

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      session: { type: 'string' },
      cwd: { type: 'string' },
      access: { type: 'string', default: 'read-only' },
      model: { type: 'string' },
      from: { type: 'string', default: 'claude' },
    },
  });
  const [target, ...rest] = positionals;
  if (!target || rest.length === 0) {
    throw new Error('usage: cli.mjs <zcode|dsh|claude> [--session id] [--cwd dir] [--access read-only|workspace-write|operate] [--model m] <prompt | ->');
  }
  if (!ACCESS_LEVELS.includes(values.access)) {
    throw new Error(`--access must be one of ${ACCESS_LEVELS.join(', ')}`);
  }
  const prompt = rest.length === 1 && rest[0] === '-' ? await readStdin() : rest.join(' ');
  if (!prompt.trim()) throw new Error('prompt is empty');

  // Stopping this job (e.g. the caller cancels the background task) must also
  // stop the peer agent, not leave it running unattended.
  const controller = new AbortController();
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => controller.abort());

  const { reply, sessionId, durationMs } = await askAgent({
    caller: values.from,
    target,
    prompt,
    sessionId: values.session,
    cwd: values.cwd,
    access: values.access,
    model: values.model,
    signal: controller.signal,
    onDesktopWait: () => process.stderr.write('agent-bridge: another job holds the desktop lock; waiting\n'),
  });
  process.stdout.write(
    `${reply}\n\n---\nagent: ${target}\nsession_id: ${sessionId ?? '(none)'}\nduration: ${(durationMs / 1000).toFixed(1)}s\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`agent-bridge: ${error.message}\n`);
  process.exit(1);
});

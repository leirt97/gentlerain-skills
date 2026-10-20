#!/usr/bin/env node
// Live end-to-end check through a real MCP client: two turns per agent, the
// second resuming the first's session. Calls real models.
//
//   node scripts/smoke.mjs [--self claude] [zcode dsh claude]

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const selfIdx = argv.indexOf('--self');
const self = selfIdx >= 0 ? argv.splice(selfIdx, 2)[1] : 'claude';
const targets = argv.length ? argv : ['zcode', 'dsh'];
const cwd = mkdtempSync(join(tmpdir(), 'agent-bridge-smoke-'));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))],
  env: { ...process.env, AGENT_BRIDGE_SELF: self },
  stderr: 'inherit',
});
const client = new Client({ name: 'agent-bridge-smoke', version: '0.1.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`self=${self} tools: ${tools.map((t) => t.name).join(', ')}`);

let failed = false;
for (const target of targets) {
  const call = async (args) => {
    const started = Date.now();
    const res = await client.callTool({ name: `ask_${target}`, arguments: { cwd, ...(target === 'claude' ? { model: process.env.SMOKE_CLAUDE_MODEL ?? 'haiku' } : {}), ...args } }, undefined, {
      timeout: 900_000,
      resetTimeoutOnProgress: true,
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (res.isError) throw new Error(`${res.content[0].text} (${secs}s)`);
    console.log(`  [${target} ${secs}s] ${JSON.stringify(res.structuredContent.reply)} session=${res.structuredContent.session_id}`);
    return res.structuredContent;
  };
  try {
    const first = await call({ prompt: 'Remember the code word "magpie-42". Reply with exactly: READY' });
    const second = await call({
      prompt: 'What was the code word I asked you to remember? Reply with only the code word.',
      session_id: first.session_id,
    });
    const ok = second.reply.includes('magpie-42');
    console.log(`  ${target}: session resume ${ok ? 'PASS' : 'FAIL'}`);
    failed ||= !ok;
  } catch (error) {
    console.log(`  ${target}: ERROR ${error.message}`);
    failed = true;
  }
}

await client.close();
process.exit(failed ? 1 : 0);

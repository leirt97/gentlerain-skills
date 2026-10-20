#!/usr/bin/env node
// agent-bridge MCP server: exposes ask_<agent> tools that forward a prompt to
// another coding agent's headless CLI and block until it replies. For long
// tasks prefer src/cli.mjs as a background job (see README).
//
// Environment (plus the ones listed in bridge.mjs):
//   AGENT_BRIDGE_SELF     which agent hosts this server (claude|zcode|dsh);
//                         its own ask_ tool is hidden so it cannot call itself
//   AGENT_BRIDGE_TARGETS  comma-separated agents to expose, default all others

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ACCESS_LEVELS, AGENTS } from './agents.mjs';
import { askAgent } from './bridge.mjs';

const PROGRESS_INTERVAL_MS = 15_000;

const self = process.env.AGENT_BRIDGE_SELF?.trim() || null;
if (self && !AGENTS[self]) {
  throw new Error(`AGENT_BRIDGE_SELF must be one of ${Object.keys(AGENTS).join(', ')}, got "${self}"`);
}
const targets = (process.env.AGENT_BRIDGE_TARGETS?.split(',') ?? Object.keys(AGENTS))
  .map((t) => t.trim())
  .filter((t) => t && t !== self);
for (const t of targets) {
  if (!AGENTS[t]) throw new Error(`AGENT_BRIDGE_TARGETS has unknown agent "${t}"`);
}

function startProgress(extra, target) {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return () => {};
  const started = Date.now();
  // Progress notifications also reset idle timeouts in clients that support it.
  const timer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken, progress: seconds, message: `waiting for ${target} (${seconds}s)` },
      })
      .catch(() => {});
  }, PROGRESS_INTERVAL_MS);
  return () => clearInterval(timer);
}

async function handleAsk(target, { prompt, session_id, cwd, access, model }, extra) {
  const stopProgress = startProgress(extra, target);
  try {
    const { reply, sessionId, durationMs } = await askAgent({
      caller: self ?? 'unknown',
      target,
      prompt,
      sessionId: session_id,
      cwd,
      access,
      model,
      signal: extra.signal,
    });
    const footer = sessionId
      ? `\n\n[agent-bridge] ${AGENTS[target].displayName} session_id=${sessionId} — pass it as session_id to continue this conversation.`
      : '';
    return {
      content: [{ type: 'text', text: reply + footer }],
      structuredContent: { agent: target, reply, session_id: sessionId, duration_ms: durationMs },
    };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `ask_${target} failed: ${error.message}` }] };
  } finally {
    stopProgress();
  }
}

const server = new McpServer({ name: 'agent-bridge', version: '0.1.0' });

for (const name of targets) {
  const adapter = AGENTS[name];
  const inputSchema = {
    prompt: z.string().min(1).describe('The full message for the other agent. It cannot see your conversation, so include all needed context.'),
    session_id: z.string().optional().describe('session_id from an earlier reply, to continue that conversation.'),
    cwd: z.string().optional().describe("Absolute working directory for the other agent. Defaults to this server's directory."),
    access: z
      .enum(ACCESS_LEVELS)
      .default('read-only')
      .describe(
        'read-only (default): read only. workspace-write: may edit files in cwd. operate: L2 work, may run commands and drive the GUI; such calls run one at a time.',
      ),
  };
  if (adapter.supportsModel) inputSchema.model = z.string().optional().describe('Model alias or id for this agent.');

  server.registerTool(
    `ask_${name}`,
    {
      title: `Ask ${adapter.displayName}`,
      description: `${adapter.description} Blocks until the reply arrives; for long tasks run src/cli.mjs as a background job instead.`,
      inputSchema,
      outputSchema: {
        agent: z.string(),
        reply: z.string(),
        session_id: z.string().nullable(),
        duration_ms: z.number(),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    (args, extra) => handleAsk(name, args, extra),
  );
}

await server.connect(new StdioServerTransport());

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, GUI_ACCESS_LEVELS } from '../src/agents.mjs';

// Fixtures mirror real CLI output captured on 2026-10-20 (ZCode CLI 0.16.9, dsh 0.2.1-rc.2).
test('zcode: parses --json output', () => {
  const out = JSON.stringify({ sessionId: 'sess_1', response: 'OK', usage: {} });
  assert.deepEqual(AGENTS.zcode.parse(out), { reply: 'OK', sessionId: 'sess_1' });
});

test('zcode: rejects output without response', () => {
  assert.throws(() => AGENTS.zcode.parse('{"sessionId":"sess_1"}'), /no response/);
  assert.throws(() => AGENTS.zcode.parse('not json'), /non-JSON/);
});

test('dsh: reads session id and final text from NDJSON events', () => {
  const out = [
    '{"type":"session","sessionId":"session-1"}',
    '{"type":"status","phase":"turn_start","turn":1}',
    '{"type":"text","text":"O"}',
    'stray diagnostic line',
    '{"type":"final","text":"OK"}',
  ].join('\n');
  assert.deepEqual(AGENTS.dsh.parse(out), { reply: 'OK', sessionId: 'session-1' });
});

test('dsh: fails loudly without a final event', () => {
  const out = '{"type":"session","sessionId":"s"}\n{"type":"error","message":"provider down"}';
  assert.throws(() => AGENTS.dsh.parse(out), /no final message: provider down/);
});

test('claude: parses result JSON and surfaces errors', () => {
  const ok = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'hi', session_id: 'abc' });
  assert.deepEqual(AGENTS.claude.parse(ok), { reply: 'hi', sessionId: 'abc' });
  const bad = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' });
  assert.throws(() => AGENTS.claude.parse(bad), /error_max_turns/);
});

test('access level maps to each CLI permission flag', () => {
  const base = { prompt: 'p', cwd: '/tmp' };
  const zc = (access) => AGENTS.zcode.build({ ...base, access }).args;
  assert.ok(zc('read-only').join(' ').includes('--mode plan'));
  assert.ok(zc('workspace-write').join(' ').includes('--mode edit'));
  assert.ok(zc('operate').join(' ').includes('--mode guarded'));
  assert.ok(zc('web').join(' ').includes('--mode guarded'));
  const dshMode = (access) => AGENTS.dsh.build({ ...base, access }).env.DSH_PERMISSION_MODE;
  assert.equal(dshMode('read-only'), 'read-only');
  assert.equal(dshMode('operate'), 'workspace-write'); // never danger-full-access
  assert.equal(dshMode('web'), 'workspace-write');
  const cl = AGENTS.claude.build({ ...base, access: 'read-only', sessionId: 'abc', model: 'haiku' });
  assert.deepEqual(cl.args, ['-p', '--output-format', 'json', '--permission-mode', 'plan', '--model', 'haiku', '--resume', 'abc']);
  assert.equal(cl.stdin, 'p');
});

test('only desktop work takes the desktop lock', () => {
  assert.equal(GUI_ACCESS_LEVELS.has('operate'), true);
  assert.equal(GUI_ACCESS_LEVELS.has('web'), false);
});

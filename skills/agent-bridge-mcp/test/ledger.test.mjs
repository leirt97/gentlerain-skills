import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InflightLedger } from '../src/run.mjs';

test('refuses once the in-flight cap is reached and frees slots on release', () => {
  const ledger = new InflightLedger(mkdtempSync(join(tmpdir(), 'ab-')), 2, 60_000);
  const r1 = ledger.acquire('claude', 'zcode');
  const r2 = ledger.acquire('zcode', 'claude');
  // Both calls may start in the same millisecond, so their listed order is not asserted.
  assert.throws(() => ledger.acquire('claude', 'zcode'), (error) => {
    assert.match(error.message, /2 bridge calls already in flight .*limit is 2/);
    assert.ok(error.message.includes('claude→zcode') && error.message.includes('zcode→claude'));
    return true;
  });
  r2();
  ledger.acquire('claude', 'dsh')();
  r1();
});

test('prunes entries from dead processes and expired calls', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-'));
  writeFileSync(join(dir, 'dead.json'), JSON.stringify({ pid: 2 ** 22 - 1, from: 'a', to: 'b', startedAt: Date.now() }));
  writeFileSync(join(dir, 'old.json'), JSON.stringify({ pid: process.pid, from: 'a', to: 'b', startedAt: Date.now() - 120_000 }));
  const ledger = new InflightLedger(dir, 1, 60_000);
  ledger.acquire('claude', 'zcode')();
  assert.deepEqual(readdirSync(dir), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopLock, InflightLedger } from '../src/run.mjs';

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

test('desktop lock: second job waits until the first releases', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ab-')), 'desktop.lock');
  const lock = new DesktopLock(path, 60_000);
  const release1 = await lock.acquire({ from: 'claude', to: 'zcode' }, { timeoutMs: 10_000 });
  let waited = false;
  let acquired = false;
  const second = lock
    .acquire({ from: 'claude', to: 'dsh' }, { timeoutMs: 10_000, onWait: () => (waited = true) })
    .then((release) => {
      acquired = true;
      return release;
    });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(waited, true);
  assert.equal(acquired, false);
  release1();
  (await second)();
  assert.equal(acquired, true);
});

test('desktop lock: takes over a lock left by a dead process', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ab-')), 'desktop.lock');
  writeFileSync(path, JSON.stringify({ pid: 2 ** 22 - 1, startedAt: Date.now() }));
  const release = await new DesktopLock(path, 60_000).acquire({ from: 'a', to: 'b' }, { timeoutMs: 1000 });
  release();
});

test('desktop lock: times out while held by a live process', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ab-')), 'desktop.lock');
  const lock = new DesktopLock(path, 60_000);
  const release = await lock.acquire({ from: 'a', to: 'b' }, { timeoutMs: 1000 });
  await assert.rejects(lock.acquire({ from: 'a', to: 'c' }, { timeoutMs: 100 }), /still held/);
  release();
});

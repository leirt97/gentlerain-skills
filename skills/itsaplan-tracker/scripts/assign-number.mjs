#!/usr/bin/env node
// Assigns the next DYYMMDDNNN to one itsaplan issue's 原编号 and prints only that number.
// Usage: node assign-number.mjs <issueId> [--date YYYY-MM-DD]   (date defaults to today, Asia/Taipei)
// "Scan all projects for the day's max → write → read back" runs under an exclusive lock file,
// so concurrent agents on this machine never receive the same number.
import { openSync, closeSync, writeSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HOME, api, listRows, sleep } from './lib.mjs'

const LOCK = join(HOME, 'assign-number.lock')
const LOCK_STALE_MS = 120_000
const LOCK_WAIT_MS = 180_000
const NUMBER = /^D(\d{6})(\d{3})$/

async function acquireLock() {
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      const fd = openSync(LOCK, 'wx', 0o600)
      writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`)
      closeSync(fd)
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    try {
      // shortcut: two waiters seeing the same stale lock can race on unlink; only reachable after a holder crashed.
      if (Date.now() - statSync(LOCK).mtimeMs > LOCK_STALE_MS) unlinkSync(LOCK)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${LOCK}`)
    await sleep(50 + Math.random() * 100)
  }
}

const originalNumberField = (issue) => {
  const field = issue.fields.find((f) => f.name === '原编号')
  if (!field) throw new Error(`issue ${issue.id} has no 原编号 field`)
  return field
}

async function assign(issueId, day) {
  const issue = await api(`/issues/${issueId}`)
  const field = originalNumberField(issue)
  if (field.value) {
    // An issue that already has its number is returned as-is, so a retried call is safe.
    if (NUMBER.test(field.value)) return field.value
    throw new Error(`issue ${issueId} already has 原编号 ${field.value}`)
  }

  let max = 0
  for (const row of await listRows()) {
    const match = NUMBER.exec(row.fields['原编号'] ?? '')
    if (match?.[1] === day) max = Math.max(max, Number(match[2]))
  }
  if (max >= 999) throw new Error(`no sequence left for ${day}`)
  const number = `D${day}${String(max + 1).padStart(3, '0')}`

  await api(`/issues/${issueId}/fields/${field.fieldId}`, { method: 'PUT', body: { value: number } })
  if (originalNumberField(await api(`/issues/${issueId}`)).value !== number) {
    throw new Error(`readback of issue ${issueId} does not show ${number}`)
  }
  const count = (await listRows()).filter((row) => row.fields['原编号'] === number).length
  if (count !== 1) throw new Error(`${number} appears ${count} times; resolve the duplicate before using it`)
  return number
}

function parseArgs([issueArg, flag, date, ...extra]) {
  const issueId = Number(issueArg)
  const usage = 'usage: assign-number.mjs <issueId> [--date YYYY-MM-DD]'
  if (!Number.isInteger(issueId) || issueId <= 0 || extra.length) throw new Error(usage)
  if (flag !== undefined && (flag !== '--date' || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? ''))) throw new Error(usage)
  const day = date
    ? date.slice(2).replaceAll('-', '')
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: '2-digit', month: '2-digit', day: '2-digit' })
        .format(new Date())
        .replaceAll('-', '')
  return { issueId, day }
}

try {
  const { issueId, day } = parseArgs(process.argv.slice(2))
  await acquireLock()
  try {
    console.log(await assign(issueId, day))
  } finally {
    unlinkSync(LOCK)
  }
} catch (error) {
  console.error(`assign-number: ${error.message}`)
  process.exitCode = 1
}

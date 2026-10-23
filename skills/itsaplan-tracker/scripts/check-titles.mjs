#!/usr/bin/env node
// Lists issues whose title has leading/trailing or repeated whitespace; --fix rewrites them collapsed.
// Usage: node check-titles.mjs [--project <ref>] [--fix]   (exit 1 while any listed title is left unfixed)
// The browser reads document.title with ASCII whitespace stripped and collapsed, so itsaplan's
// title hook never sees its own value as applied and loops: the issue page freezes on open.
import { api, listRows } from './lib.mjs'

const normalizeTitle = (title) => title.replace(/[\t\n\f\r ]+/g, ' ').trim()

const args = process.argv.slice(2)
const fix = args.includes('--fix')
const projectAt = args.indexOf('--project')
const project = projectAt === -1 ? undefined : args[projectAt + 1]
if ((projectAt !== -1 && !project) || args.length !== (fix ? 1 : 0) + (project ? 2 : 0)) {
  console.error('usage: check-titles.mjs [--project <ref>] [--fix]')
  process.exit(1)
}

let unfixed = 0
for (const row of await listRows(project)) {
  const title = normalizeTitle(row.title)
  if (title === row.title) continue
  let state = 'needs fix'
  if (fix) {
    await api(`/issues/${row.id}`, { method: 'PATCH', body: { title } })
    state = (await api(`/issues/${row.id}`)).title === title ? 'fixed' : 'readback mismatch'
  }
  if (state !== 'fixed') unfixed++
  console.log([row.identifier, state, JSON.stringify(row.title)].join('\t'))
}
process.exitCode = unfixed ? 1 : 0

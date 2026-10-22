#!/usr/bin/env node
// Prints compact TSV rows (no descriptions) so agents never load raw board JSON into context.
// Usage: node list.mjs [--project <ref>] [--number <原编号>] [--q <title text>] [--field <name>=<value>]...
// Columns: ref, id, identifier, 状态列, 原编号, 事项类型, 归属迭代, title
import { listRows } from './lib.mjs'

const args = process.argv.slice(2)
const filters = []
let project
for (let i = 0; i < args.length; i += 2) {
  const [flag, value] = [args[i], args[i + 1]]
  if (value === undefined) throw new Error(`missing value for ${flag}`)
  if (flag === '--project') project = value
  else if (flag === '--number') filters.push((row) => row.fields['原编号'] === value)
  else if (flag === '--q') filters.push((row) => row.title.includes(value))
  else if (flag === '--field') {
    const [name, expected] = value.split('=')
    filters.push((row) => (row.fields[name] ?? '') === (expected ?? ''))
  } else throw new Error(`unknown option ${flag}`)
}

for (const row of await listRows(project)) {
  if (!filters.every((match) => match(row))) continue
  const f = row.fields
  console.log([row.ref, row.id, row.identifier, row.column, f['原编号'] ?? '', f['事项类型'] ?? '', f['归属迭代'] ?? '', row.title].join('\t'))
}

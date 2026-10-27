// Shared itsaplan REST access for the skill scripts. Config and the lock live in ITSAPLAN_HOME
// (default ~/.itsaplan); bootstrap.json there provides apiUrl, appUrl and agentKeys: the API key of each
// project's AI agent by project ref, so every change is recorded under that agent.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HOME = process.env.ITSAPLAN_HOME ?? join(homedir(), '.itsaplan')
const cfg = JSON.parse(readFileSync(join(HOME, 'bootstrap.json'), 'utf8'))

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function api(path, { ref, method = 'GET', body } = {}) {
  const key = cfg.agentKeys[ref]
  if (!key) throw new Error(`bootstrap.json agentKeys has no key for project ${ref}`)
  const headers = { 'x-api-key': key, Origin: cfg.appUrl }
  if (body !== undefined) headers['content-type'] = 'application/json'
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(cfg.apiUrl + path, { method, headers, body: body && JSON.stringify(body) })
    const text = await res.text()
    if (res.ok) return text ? JSON.parse(text) : null
    // API-key rate limiting surfaces as a 500; the counter clears after 1 s without requests.
    if ((res.status === 500 || res.status === 429) && attempt < 5) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`)
  }
}

// Compact rows for every issue (or one project): custom fields by name, column by name, no description.
export async function listRows(onlyRef) {
  const refs = onlyRef ? [onlyRef] : Object.keys(cfg.agentKeys)
  const rows = []
  for (const ref of refs) {
    const project = await api(`/projects/${ref}`, { ref })
    const columns = new Map(project.columns.map((c) => [c.id, c.name]))
    const fields = new Map(project.customFields.map((f) => [f.id, f]))
    for (const issue of (await api(`/projects/${ref}/issues/board`, { ref })).issues) {
      const values = {}
      for (const v of issue.fieldValues) {
        const field = fields.get(v.fieldId)
        if (!field) continue
        values[field.name] = v.optionIds.length
          ? v.optionIds.map((id) => field.options.find((o) => o.id === id)?.value).join(',')
          : (v.value ?? '')
      }
      rows.push({ ref, id: issue.id, identifier: issue.identifier, column: columns.get(issue.columnId), title: issue.title, fields: values })
    }
  }
  return rows
}

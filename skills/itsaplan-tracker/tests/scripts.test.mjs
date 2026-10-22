import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const script = (name) => new URL(`../scripts/${name}`, import.meta.url).pathname

// Minimal itsaplan: two projects sharing field names, issue 1 already numbered for 2026-10-22.
function startMock() {
  const projects = {
    'a.A': { id: 1, fieldId: 11, kindId: 12 },
    'b.B': { id: 2, fieldId: 21, kindId: 22 },
  }
  const issues = new Map()
  for (let id = 1; id <= 10; id++) {
    issues.set(id, { id, ref: id <= 5 ? 'a.A' : 'b.B', title: `issue ${id}`, number: null })
  }
  issues.get(1).number = 'D261022001'
  issues.get(2).number = 'EXT-7'

  const fieldsOf = (issue) => {
    const p = projects[issue.ref]
    return [
      { fieldId: p.fieldId, name: '原编号', value: issue.number, optionIds: [] },
      { fieldId: p.kindId, name: '事项类型', value: null, optionIds: [1] },
    ]
  }
  const server = createServer(async (req, res) => {
    const send = (body) => res.end(JSON.stringify(body))
    const url = new URL(req.url, 'http://x')
    let m
    if (url.pathname === '/projects') return send(Object.keys(projects).map((ref) => ({ ref })))
    if ((m = url.pathname.match(/^\/projects\/([^/]+)$/))) {
      const p = projects[m[1]]
      return send({
        columns: [{ id: 1, name: '新问题' }],
        customFields: [
          { id: p.fieldId, name: '原编号', options: [] },
          { id: p.kindId, name: '事项类型', options: [{ id: 1, value: '问题' }] },
        ],
      })
    }
    if ((m = url.pathname.match(/^\/projects\/([^/]+)\/issues\/board$/))) {
      const list = [...issues.values()].filter((i) => i.ref === m[1])
      return send({
        issues: list.map((i) => ({
          id: i.id, identifier: `${m[1].split('.')[1]}-${i.id}`, columnId: 1, title: i.title, description: 'x'.repeat(5000),
          fieldValues: fieldsOf(i).filter((f) => f.value || f.optionIds.length).map(({ fieldId, value, optionIds }) => ({ fieldId, value, optionIds })),
        })),
      })
    }
    if ((m = url.pathname.match(/^\/issues\/(\d+)$/))) return send({ id: Number(m[1]), fields: fieldsOf(issues.get(Number(m[1]))) })
    if ((m = url.pathname.match(/^\/issues\/(\d+)\/fields\/(\d+)$/)) && req.method === 'PUT') {
      let body = ''
      for await (const chunk of req) body += chunk
      await new Promise((r) => setTimeout(r, 30)) // widen the read→write race window
      issues.get(Number(m[1])).number = JSON.parse(body).value
      return send({ ok: true })
    }
    res.statusCode = 404
    res.end('{}')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, issues })))
}

async function withMock(fn) {
  const { server, issues } = await startMock()
  const home = mkdtempSync(join(tmpdir(), 'itsaplan-test-'))
  const { port } = server.address()
  writeFileSync(join(home, 'bootstrap.json'), JSON.stringify({ apiUrl: `http://127.0.0.1:${port}`, appUrl: 'http://app', apiKey: 'test' }))
  try {
    await fn({ issues, home, env: { ...process.env, ITSAPLAN_HOME: home } })
  } finally {
    server.close()
  }
}

test('concurrent assign-number calls across projects never share a number', async () => {
  await withMock(async ({ issues, home, env }) => {
    const targets = [3, 4, 5, 6, 7, 8, 9, 10]
    const outputs = await Promise.all(
      targets.map((id) => run('node', [script('assign-number.mjs'), String(id), '--date', '2026-10-22'], { env })),
    )
    const numbers = outputs.map((o) => o.stdout.trim()).sort()
    assert.deepEqual(numbers, ['002', '003', '004', '005', '006', '007', '008', '009'].map((n) => `D261022${n}`))
    assert.deepEqual(targets.map((id) => issues.get(id).number).sort(), numbers)
    assert.equal(existsSync(join(home, 'assign-number.lock')), false)
  })
})

test('assign-number is idempotent and refuses to overwrite an external number', async () => {
  await withMock(async ({ env }) => {
    const { stdout } = await run('node', [script('assign-number.mjs'), '1'], { env })
    assert.equal(stdout.trim(), 'D261022001')
    await assert.rejects(run('node', [script('assign-number.mjs'), '2'], { env }), /already has 原编号 EXT-7/)
  })
})

test('list prints compact filtered rows without descriptions', async () => {
  await withMock(async ({ env }) => {
    const { stdout } = await run('node', [script('list.mjs'), '--number', 'D261022001'], { env })
    assert.equal(stdout, 'a.A\t1\tA-1\t新问题\tD261022001\t问题\t\tissue 1\n')
  })
})

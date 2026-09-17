import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../references/workflow.md', import.meta.url), 'utf8')
const apiNotes = await readFile(new URL('../references/api-notes.md', import.meta.url), 'utf8')
const skillLibrary = await readFile(new URL('../../craft-skill-library/SKILL.md', import.meta.url), 'utf8')

test('Craft user issue numbers use the global daily registry contract', () => {
    assert.match(workflow, /DYYMMDDNNN/)
    assert.match(workflow, /中央登记文档 `问题编号登记`/)
    assert.match(workflow, /范围覆盖全部问题跟踪合集/)
    assert.match(workflow, /同一日期从 `001` 开始/)
    assert.match(workflow, /先写入登记记录并标记为“已预留”/)
    assert.match(workflow, /已用序号不回收/)
    assert.match(workflow, /\^D\[0-9\]\{9\}\$/)
    assert.doesNotMatch(workflow, /DYYMMDDHHMM/)
})

test('Craft collection capability distinguishes API creation from UI-only configuration', () => {
    assert.match(apiNotes, /POST \/collections/)
    assert.match(apiNotes, /CLI 未封装.*不等于 Craft API 不支持/)
    assert.match(apiNotes, /模板副本、表格\/看板.*API 未暴露/)
    assert.match(skillLibrary, /CLI 未封装不代表 Craft API 不支持/)
})

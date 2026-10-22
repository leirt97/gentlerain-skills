import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const skill = await read('SKILL.md')
const workflow = await read('references/workflow.md')
const logFormat = await read('references/log-format.md')
const apiNotes = await read('references/api-notes.md')

test('user-provided todos keep the DYYMMDDNNN contract, allocated from 原编号', () => {
    assert.match(workflow, /DYYMMDDNNN/)
    assert.match(workflow, /\^D\[0-9\]\{9\}\$/)
    assert.match(workflow, /写入自定义字段 `原编号`/)
    assert.match(workflow, /`GET \/projects` 列出全部项目/)
    assert.match(workflow, /来源表格自带的编号.*不是稳定身份/)
    assert.match(workflow, /已用序号不回收/)
    assert.doesNotMatch(workflow, /登记合集/)
})

test('status chain is defined once and fix rounds are comments', () => {
    assert.match(workflow, /新问题 → AI 处理中 → AI 本地已修复 → AI 已验证 → 用户已验证 → 已发版 → 已关闭/)
    assert.match(logFormat, /每轮一条评论/)
    assert.match(skill, /修复轮次只发评论/)
})

test('todos carry 事项类型 and 归属迭代 on creation', () => {
    assert.match(skill, /`事项类型` 区分 `功能` 与 `问题`/)
    assert.match(skill, /一次设齐 `事项类型`、`归属迭代`/)
})

test('API notes resolve IDs by name and keep the key out of output', () => {
    assert.match(apiNotes, /按名称从 `GET \/projects\/<ref>` 解析/)
    assert.match(apiNotes, /不写入命令行回显、日志、评论或文档/)
    assert.doesNotMatch(apiNotes, /"apiKey":\s*"/)
})

test('no Craft dependency remains', () => {
    for (const doc of [skill, workflow, logFormat, apiNotes]) assert.doesNotMatch(doc, /Craft/)
})

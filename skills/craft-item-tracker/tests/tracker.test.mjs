import assert from 'node:assert/strict'
import test from 'node:test'
import { daysBetween, defaultStatus, formatLogTime, lastLogDate } from '../scripts/tracker.mjs'

const item = (...lines) => ({ content: lines.map((markdown) => ({ markdown })) })

test('log time is Asia/Taipei with weekday and 上午/下午', () => {
    assert.equal(formatLogTime(new Date('2026-10-29T04:57:00Z')), '2026-10-29 星期四 下午12:57')
    assert.equal(formatLogTime(new Date('2026-01-05T01:05:00Z')), '2026-01-05 星期一 上午9:05')
})

test('last log date is the first dated line under 进展记录', () => {
    assert.equal(lastLogDate(item('## 目标', '2026-01-01 写在目标里', '## 进展记录', '', '2026-10-24 星期六 上午10:05  暂停', '2026-10-15 x')), '2026-10-24')
    assert.equal(lastLogDate(item('## 进展记录')), undefined)
    assert.equal(lastLogDate(item('没有标题', '2026-10-24 x')), undefined)
})

test('days between ISO dates crosses month ends', () => {
    assert.equal(daysBetween('2026-10-24', '2026-10-29'), 5)
    assert.equal(daysBetween('2026-10-31', '2026-11-01'), 1)
})

test('a new idea starts undecided, life and work items start as to-do', () => {
    assert.equal(defaultStatus('想法'), '未决定')
    assert.equal(defaultStatus('生活'), '待做')
    assert.equal(defaultStatus('工作'), '待做')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { awaitsAcceptance, changeLine, childIds, daysBetween, defaultStatus, followedStatus, formatLogTime, itemId, lastLogDate, latestEntry, taskText } from '../scripts/tracker.mjs'

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

test('children are the items linked from the parent body', () => {
    const a = 'a2648012-38c3-cc25-0fc4-91fdcc0231ad'
    const b = '167a0e83-d280-c6ff-5d72-8e75deab4779'
    assert.deepEqual(childIds(item('## 清单', `- 窗帘 → [新家：窗帘](block://${a})`, `- 灯光 → [x](block://${b}) [y](block://${a})`, '- [ ] 撑杆')), [a, b])
})

test('children pause and are dropped with the parent, then resume to their recorded status', () => {
    const followed = item('## 进展记录', '2026-10-29 星期四 下午3:20  随父事项「185 手机号」暂停，原状态：等待他人  → 暂停')
    const ownPause = item('## 进展记录', '2026-10-30 星期五 上午9:00  暂停：柜台没开｜恢复条件：周一  → 暂停', followed.content[1].markdown)
    assert.equal(followedStatus('暂停', item(), '待做'), '暂停')
    assert.equal(followedStatus('放弃', item(), '暂停'), '放弃')
    assert.equal(followedStatus('暂停', item(), '完成'), undefined)
    assert.equal(followedStatus('暂停', item(), '暂停'), undefined)
    assert.equal(followedStatus('进行中', followed, '暂停'), '等待他人')
    assert.equal(followedStatus('进行中', ownPause, '暂停'), undefined)
    assert.equal(followedStatus('完成', followed, '暂停'), undefined)
    assert.equal(followedStatus('进行中', item(), '待做'), undefined)
    const followedEntry = item('## 进展记录', '2026-10-31 星期六 上午9:00', '随父事项「185 手机号」暂停', '等待他人 → 暂停', '*******', '2026-10-29 星期四 下午3:20  旧记录')
    assert.equal(followedStatus('进行中', followedEntry, '暂停'), '等待他人')
})

test('the newest entry ends at the next page break or dated block', () => {
    const entry = item('## 进展记录', '2026-10-29 星期四 下午4:38', '验收完成', '- Web 已验证', '进行中 → 完成', '*******', '2026-10-29 星期四 下午3:50  开始')
    assert.equal(latestEntry(entry), '2026-10-29 星期四 下午4:38\n验收完成\n- Web 已验证\n进行中 → 完成')
    assert.equal(latestEntry(item('## 进展记录', '2026-10-29 星期四 下午3:50  一行记录', '2026-10-28 星期三 上午9:00  更早')), '2026-10-29 星期四 下午3:50  一行记录')
    assert.equal(lastLogDate(entry), '2026-10-29')
})

test('an inbox to-do keeps its text without the checkbox', () => {
    assert.equal(taskText({ markdown: '- [ ] 办房产证' }), '办房产证')
    assert.equal(taskText({ markdown: '- [ ] 豆包输入法，快捷词语录入' }), '豆包输入法，快捷词语录入')
})

test('an item is found by its ID or by the link Craft copies for it', () => {
    const id = 'ed252a33-dd14-be21-3d46-b25038cd49f3'
    assert.equal(itemId(`craftdocs://open?spaceId=0013697c-dced-8fb5-6bb2-737a5f12a5c1&blockId=${id}`), id)
    assert.equal(itemId(`craftdocs://open?blockId=${id.toUpperCase()}&spaceId=x`), id)
    assert.equal(itemId(`https://docs.craft.do/editor/d/0013697c-dced-8fb5-6bb2-737a5f12a5c1/8d00cc1f-abe7-7a20-0f42-f2a9db101538/b/${id}?s=token`), id)
    assert.equal(itemId(id), id)
    assert.equal(itemId('房产证'), '房产证')
})

test('a field change reads 原值 → 新值, with 无 for an empty field', () => {
    assert.equal(changeLine('进行中', '完成'), '进行中 → 完成')
    assert.equal(changeLine(undefined, 'AI 规划中'), '无 → AI 规划中')
})

test('work the AI finished waits for acceptance until the item is closed', () => {
    assert.equal(awaitsAcceptance('进行中', 'AI 已处理'), true)
    assert.equal(awaitsAcceptance('等待他人', 'AI 已验证'), true)
    assert.equal(awaitsAcceptance('进行中', 'AI 执行中'), false)
    assert.equal(awaitsAcceptance('完成', 'AI 已验证'), false)
    assert.equal(awaitsAcceptance('进行中', undefined), false)
})

---
name: craft-item-tracker
description: 跟踪用户的想法、生活事项和需要了解梳理推进的工作事项（Craft「事项跟踪」合集）：用户说起这类事开始做、正在做、做完或放下时记录进展；也用于新建事项、迁入 Craft 收件箱待办、改状态或本周计划、查看进行中/本周/停滞事项。具体的缺陷、功能和编码修复用 itsaplan-tracker。
---

# 想法、生活与工作事项

事项保存在 Craft 文档「事项跟踪」的「事项」合集里，想法、生活和工作事项共用一张表。所有读写都用 `scripts/tracker.mjs`（Node 22+，依赖 `~/D/Craft` 里的 Craft API 客户端和凭据）：

```bash
node scripts/tracker.mjs list [--item <ID|标题片段>] [--status <状态>] [--week|--no-week] [--type <想法|生活|工作>]
node scripts/tracker.mjs add --title <标题> --type <想法|生活|工作> [--status <状态>] [--week] [--due YYYY-MM-DD] [--next <下一步>]
node scripts/tracker.mjs log --item <ID|标题片段> --text <进展> [--status <新状态>]
node scripts/tracker.mjs set --item <ID|标题片段> [--week|--no-week] [--due YYYY-MM-DD] [--next <下一步>]
node scripts/tracker.mjs review [--write]
node scripts/tracker.mjs inbox
node scripts/tracker.mjs import --task <待办ID> (--type <想法|生活|工作> [--title <标题>] | --item <ID|标题片段>)
node scripts/tracker.mjs now   # 当前时间戳；raycast/timestamp.sh 用它给用户手写记录粘贴时间
```

## 范围

- 判断标准：能直接按缺陷修复流程处理的事（具体缺陷、功能、编码修复）进 itsaplan，用 itsaplan-tracker；还要先了解、梳理、做判断才能推进的事进本表。
- 工作事项的标题加项目前缀，例如 `智慧运营：摸清后端告警链路`。
- 推进中发现具体问题：用 itsaplan-tracker 建问题，再在本事项 `log` 一行 `发现<问题>，已建 itsaplan <编号>`。
- 了解到的后端逻辑、运维步骤等知识写进 Craft 普通文档（`~/D/Craft/craft-api.mjs` 的 `create-document`、`insert-markdown`），本事项只 `log` 一行附文档链接。

## 字段

- **类型**：想法 / 生活 / 工作。
- **状态**只表示进展：`未决定 → 待做 → 进行中 → 暂停 / 等待他人 → 完成 / 放弃`。
- **本周**表示这周打算处理，与状态独立：本周 + 进行中、本周 + 待做都成立。
- **截止日期**只填硬截止。
- **下一步**只写当前一个具体动作，做完就改写成下一个。多步骤的清单写在事项正文里。

一条事项是一件需要单独跟踪进展的事。某个步骤要单独等别人、会跨好几周、或有自己的截止日期时，才拆成独立事项，把原事项正文里的那一步改成指向它的链接（`[标题](block://<ID>)`）。

父事项正文里链接到的事项就是它的子事项，只用一层。`log --status` 把父事项改为暂停或放弃时，未结束的子事项跟着改，并各记一行 `随父事项「…」<状态>，原状态：<状态>`；父事项再改为其他未结束的状态时，最新记录还是这一行的子事项回到原状态。父事项完成不带动子事项。

## 记录

- 进展只记有信息量的内容：做了什么决定、拿到什么结果、卡在哪里，一句话写清楚。
- 状态变化用 `log --status`，`--text` 写原因；暂停写成 `暂停：<原因>｜恢复条件：<条件>`。

## 收件箱

待办统一归到事项里管理：用户想到的待办先放进 Craft 任务收件箱，再让 AI 迁入。用户说收件箱有新待办时，`inbox` 列出，逐条按「范围」和查重判断去处：

- 需要单独跟踪的，`import --type` 建新事项；工作事项用 `--title` 加项目前缀。
- 是已有事项其中一步的，`import --item` 加进该事项的 `## 清单`。
- 拿不准归属的，问用户。

`import` 会把原待办标为已取消，移到 Craft 的 logbook，需要时可以在那里恢复。全部迁完后 `inbox` 显示没有待办。

## 执行

1. 先按「范围」确定这件事进本表，再 `list` 查重：已有条目就更新它，没有才 `add`。用户给了 Craft 里复制的事项链接（`craftdocs://open?…&blockId=<ID>`）时，直接把链接传给 `--item`。标题片段匹配到多条时，向用户确认是哪一条。
2. 写入：新建用 `add`，它同时写好正文的「目标」「进展记录」两段；进展和状态变化用 `log`；本周、截止日期、下一步用 `set`。
3. 用户说开始做或正在做某件事时：按 1–2 处理这件事，再 `list --status 进行中` 查其余进行中的事项，逐条问用户是继续、暂停还是等待他人，按回答 `log --status`。同一次对话里已经问过的事项不再问。
4. 回读：写入后用 `list --item <ID>` 确认状态、本周、下一步和「最后推进」日期与预期一致。

## 交付

报告改动的事项标题、写入的记录行、当前状态和本周勾选，以第 4 步的回读结果为准。

## 回顾

- **每日**：每晚 20:00 由 LaunchAgent `com.cutesunday.craft-tracker-review` 运行 `review --write`，把停滞事项写进当天 Daily Note；排查看 `~/Library/Logs/craft-tracker-review.log`。用户要求时直接运行 `review`。
- **每周**（用户发起）：逐条确认本周勾选，没做完的保留或 `set --no-week`；本周没有进展记录的进行中事项改为暂停或等待他人。

改 description 后，用 `evals/` 的用例和 yao-meta-skill 的 `trigger_eval.py` 复测触发。

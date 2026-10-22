---
name: itsaplan-tracker
description: 管理 itsaplan（It's a Plan）待办：新建功能或问题并分配编号，推进状态列，以评论追加修复轮次，按归属迭代归类或新增版本。仅负责 itsaplan 待办记录与流转；不负责代码修复、外部业务系统写入或 Skill 库同步。
---

# itsaplan 待办

itsaplan 中每条待办是一个事项，`事项类型` 区分 `功能` 与 `问题`。项目即产品（如大河湖 `dahehu.RHL`、蜂巢 `fengchao.FC`，全部项目以 `GET /projects` 为准），版本由 `归属迭代` 字段区分。

## 执行

1. 确定项目 ref、版本和事项类型；缺少必要绑定时只追问该项。连接方式、ID 解析和接口坑见 [接口要点](references/api-notes.md)。状态判定、编号和新增版本遵循 [流程与权限](references/workflow.md)；描述与修复轮次评论遵循 [记录格式](references/log-format.md)。
2. 写前查重：`node scripts/list.mjs --number <原编号>` 或 `--q <标题片段>`，它只输出精简的一行一条，不含描述。按 [编号契约](references/workflow.md#编号契约) 为每条新待办得出编号决策。
3. 写入：新建时设齐 `事项类型`、`归属迭代` 和状态列；外部编号直接写 `原编号`，用户来源的编号由 `node scripts/assign-number.mjs <issueId>` 分配并写入。改状态只改列；修复轮次只发评论，描述保持原始内容。
4. 每次写入后回读：字段与状态列用 `list.mjs --number`，评论用 `feed?filter=comments&limit=1`，附件用附件列表；只在改过描述时读单条事项核对描述。保护用户同期编辑，结果不明时先回读已完成部分再继续。

## 交付

报告新增/更新数、每条的事项 identifier 与 `原编号`、当前状态列、编号决策和回读结果。完成标准：每条目标待办在 board 上有唯一 `原编号`，类型、版本、状态与回读一致。

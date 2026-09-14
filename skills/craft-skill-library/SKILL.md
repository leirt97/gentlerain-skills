---
name: craft-skill-library
description: 安装、更新或卸载 Skill 后同步 Craft Skill 目录；也用于“更新 Skill 库”和补录 Craft 收藏。
---

# Craft Skill 库同步

维护 `${CRAFT_SKILL_LIBRARY_DIR:-${HOME}/D/Craft/skill-library}/target.json` 绑定的原生集合及其自动维护详情区块。下文 JSON 文件均位于该目录。使用现有 Craft API，从项目 `.env.example` 加载凭据。运行环境需 Node.js 22+、Python 3.11+ 和 PyYAML；缺失时报告阻塞。

## 来源与范围

本地安装、更新或卸载完成后，按已核实的来源登记，保留其他记录：

- 用户创建：将 `SKILL.md` 的真实绝对路径作为键、“用户创建”作为值写入 `source-origins.json`，依据本次用户说明或可核实的创建记录。
- 仓库安装：若 `~/.agents/.skill-lock.json` 未记录来源，以相同路径为键，将已核实且无凭据的 GitHub 仓库 URL 写入 `install-sources.json`。
- 默认扫描范围之外的 Skill：首次同步附加 `--skill-path /绝对路径/SKILL.md --scope 项目`；其他工具独立全局目录用 `其他工具`，插件用 `插件`。路径会持久登记，批量可重复传入 `--skill-path`。
- 插件变更：按宿主实际启用的技能路径登记；仅 Codex 插件根快照使用 `plugin-roots.json`，保留其他宿主登记。

扫描覆盖共享全局、Codex 系统、已登记的其他工具或项目及运行时插件技能，按内容去重；详细差异见 `last-plan.json`。

## 同步

主 Agent 串行执行一次确定性批处理：

```bash
CRAFT_SKILL_LIBRARY_DIR="${CRAFT_SKILL_LIBRARY_DIR:-${HOME}/D/Craft/skill-library}"
node "${CRAFT_SKILL_LIBRARY_DIR}/update.mjs" sync
```

正常差异属于 Skill 维护授权范围，由脚本完成扫描、校验、提交和回读。脱敏阶段日志默认写入当前任务的 `work/craft-sync/`，可用 `--log-dir /absolute/task/work/run` 指定；只将最终 JSON 返回模型。

以 `status=success`、`remaining=0` 且 `conflicts`、`missingLocal` 为空作为完成条件；`applied` 是已通过远端回读的数量。其余状态按实际阶段及 `logPath` 报告，按已保存状态恢复；保留远端行、人工内容及同步身份，停止依赖冲突或缺失条目的写入。

`needs_review` 时，读取 `reviewFile` 中的变化元数据和必要 Skill 段落，保存 JSON 数组，每项含 `skill`、`newSummary`（中文）和 `expectedHash`（扫描所得完整源 hash），再执行：

```bash
CRAFT_SKILL_LIBRARY_DIR="${CRAFT_SKILL_LIBRARY_DIR:-${HOME}/D/Craft/skill-library}"
node "${CRAFT_SKILL_LIBRARY_DIR}/update.mjs" sync --patch-file /absolute/task/work/summary-patch.json
```

脚本核验源 hash 和身份后，原子更新本地摘要并同步。少量摘要由主 Agent 整理；大量内容仅在可独立一次交接时委派低成本模型，其职责止于读取变化条目、生成带 hash 的 patch，提交与验证由主 Agent 调用脚本完成。

明确要求预览或定位故障时使用 `plan` / `apply`。目录同步成功只证明目录回读通过。

## 卸载历史

卸载仍使用同一 `sync`。全部历史安装路径已不存在时，脚本从 `state.json` 恢复身份，以原记录标为“未安装”；保留历史路径和人工内容供重装识别。仍有本地副本时按实际安装情况处理。删除历史须由用户明确决定；恢复依照同步状态，不手改生成的 `catalog.json`。

## Craft 收藏补录

使用 `craft-api.mjs` 导出的 `buildClient` 与 `craftRequest` 查询 `/documents/search`，按文档 ID 去重并读原文。具体技能或技能包加入 `craft-sources.json` 的 `records`，附原文 ID 和证据；概念页和普通工具记入 `excluded`。保留现有来源及原文。

上游来源和名称都相符才合并本地与 Craft 条目；同名不同内容分别保留，未知安装身份标为“待核实”。

API/CLI 无法完成且用户明确要求的 Craft UI 操作，按 `gemini-computer-use` 处理。

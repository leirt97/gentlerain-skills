# gentlerain-skills

通用个人 Agent Skills。每个 Skill 的唯一维护源位于 `skills/<name>/`；全局或项目目录仅通过软链接激活这些维护源。

插件自带 skills、Codex `.system` skills 和第三方受管真源（如 `ego-browser`）保留在各自宿主管理的目录，不迁入本仓库。

## 激活位置

跨工具通用的 skill 链到 `~/.agents/skills`。只适用单一工具的 skill 不进 `~/.agents/skills`，只链到对应工具的 skills 目录，并在下表记明原因：

| Skill | 链接位置 | 原因 |
| --- | --- | --- |
| `luna-astra-coding` | `~/.codex/skills` | 依赖 Codex 专有接口 |
| `codex-cua-jev` | `~/.claude/skills`、`~/.zcode/skills`、`~/.dsh/skills` | Claude、ZCode、DSH 的桌面操作通道；Codex 自带 Computer Use，不需要它 |

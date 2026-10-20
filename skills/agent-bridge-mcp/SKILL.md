---
name: agent-bridge-mcp
description: 把任务委派给本机 ZCode 或 DeepSeek Harness（dsh）并在当前会话续接结果：用户要求让 ZCode/dsh 审查、实现、回答或给第二意见，或要继续与它们的对话时使用。
---

# 委派 ZCode / DeepSeek Harness

对方是独立的编码 Agent，看不到本会话；它的回复是同行意见，采纳前按普通证据核验。

## 执行

1. 确定目标（`zcode` 或 `dsh`）、绝对路径 `cwd` 和 `access`：默认 `read-only`；用户要求对方改文件时才用 `workspace-write`。写出自足的 prompt：目标、相关文件路径、约束和期望的回复形式。
2. 以宿主的**后台任务**启动，进程退出即唤醒本会话（Claude 中为 Bash `run_in_background`）。可并行派发，同时在途上限默认 3：

   ```bash
   node <本 skill 目录>/src/cli.mjs zcode --cwd /abs/project [--session <id>] [--access workspace-write] - <<'EOF'
   <prompt>
   EOF
   ```

   预计一分钟内答完的小问题，可改用 MCP 工具 `ask_zcode` / `ask_dsh`（同步阻塞，参数同上）。
3. 被唤醒后读输出：回复正文，`---` 后是 `agent`、`session_id`、`duration`。退出码 1 时 stderr 带错误和对方 CLI 的输出尾部，先按错误定位，再决定是否重派。
4. 追问或分步推进时，传入上次的 `--session <id>`，在同一对话中续接。

## 交付

向用户说明每个对方的结论（概括，不整段转贴）、你核验后的判断，以及保留的 `session_id`。`workspace-write` 任务以 `git diff` 或文件回读列出实际改动。

权限映射、模型来源、防递归和本机适配要点见 [README](README.md)。

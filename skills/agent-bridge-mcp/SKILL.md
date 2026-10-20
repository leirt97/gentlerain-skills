---
name: agent-bridge-mcp
description: 把任务委派给本机 ZCode 或 DeepSeek Harness（dsh）并在当前会话续接结果：用户要求让 ZCode/dsh 审查、实现、回答或给第二意见，或要继续与它们的对话时使用。
---

# 委派 ZCode / DeepSeek Harness

对方是独立的编码 Agent，看不到本会话；它的回复是同行意见，采纳前按普通证据核验。

## 执行

1. 确定目标（`zcode` 或 `dsh`）、绝对路径 `cwd` 和 `access`：默认 `read-only`；对方要改文件用 `workspace-write`；L2 操作桌面应用用 `operate`，网页 L2 用 `web`，按下方 L2 约定写 prompt。写出自足的 prompt：目标、相关文件路径、约束和期望的回复形式。
2. 以宿主的**后台任务**启动，进程退出即唤醒本会话（Claude 中为 Bash `run_in_background`）。可并行派发，同时在途上限默认 3：

   ```bash
   node <本 skill 目录>/src/cli.mjs zcode --cwd /abs/project [--session <id>] [--access workspace-write] - <<'EOF'
   <prompt>
   EOF
   ```

   预计一分钟内答完的小问题，可改用 MCP 工具 `ask_zcode` / `ask_dsh`（同步阻塞，参数同上）。
3. 被唤醒后读输出：回复正文，`---` 后是 `agent`、`session_id`、`duration`。退出码 1 时 stderr 带错误和对方 CLI 的输出尾部，先按错误定位，再决定是否重派。
4. 追问或分步推进时，传入上次的 `--session <id>`，在同一对话中续接。

## L2 约定

`operate` 任务独占桌面锁，后派的任务排队等待；桌面应用任务一律用 `operate`，dsh 在 `workspace-write` 下同样能调界面工具，但不进锁。`web` 任务各自建 ego lite 任务空间，可并行派发。prompt 写明：

- 桌面应用：通道为 `codex-computer-use` MCP 工具，配套 skill `codex-cua-jev`；先取应用状态再操作。本机系统语言为繁体中文，界面文字是繁体，按英文名或 bundle id（如 `com.apple.calculator`）定位应用。快捷键可能送不达应用，改用菜单或元素点击；应用可能带上次的残留状态，先清空或确认初始状态。
- 网页：只用 ego lite。先执行 `ego-browser skill` 读当前版本指南并照做；在自己新建的任务空间内操作，结束时 `task.finish({ keep: [] })`；不碰用户已有标签页，不清除 cookie、缓存或存储。
- 无人值守：不提交、不推送、不做不可逆或外部写入；遇到登录、扫码、付款等需本人的步骤，停下报告。
- 回复给出每一步的操作、观察到的界面证据（文字、截图路径或无障碍树片段）和 `passed` / `failed` / `blocked` 结论，并关闭本次打开的应用。

L2 结论采纳前，按回复里的证据核验；需要时自己再取一次界面状态。

## 交付

向用户说明每个对方的结论（概括，不整段转贴）、你核验后的判断，以及保留的 `session_id`。`workspace-write` 任务以 `git diff` 或文件回读列出实际改动。

权限映射、模型来源、防递归和本机适配要点见 [README](README.md)。

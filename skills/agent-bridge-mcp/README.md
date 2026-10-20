# agent-bridge

让 Claude 桌面端会话把任务交给 ZCode 或 DeepSeek Harness（dsh），对方完成后唤醒原会话继续处理。底层只调用两边官方提供的无界面 CLI，不依赖它们的私有协议。

| 方向 | 用法 | 适用 |
|---|---|---|
| Claude → ZCode / dsh（异步，主通道） | 用后台 Bash 运行 `src/cli.mjs`；进程退出时宿主唤醒会话，输出里带回复和 `session_id` | 耗时任务、可并行派发多个 |
| Claude → ZCode / dsh（同步） | MCP 工具 `ask_zcode` / `ask_dsh`（user 级注册，名为 `agent-bridge`） | 几十秒内能答完的问题；调用期间会话阻塞 |

ZCode 和 dsh 没有注册本服务：它们“回话”的方式就是任务结束，由 Claude 读取回复后决定下一步。`ask_claude` 适配器仍保留在代码里，供以后需要时使用；它会启动一个独立的 `claude -p` 会话，而不是回到桌面端会话。

## 命令行

```bash
node src/cli.mjs zcode --cwd /abs/project '审查 src/foo.ts 的错误处理'
node src/cli.mjs dsh --session session-… '继续：按你的建议列出改动点'
echo '很长的提示词' | node src/cli.mjs zcode --cwd /abs/project -
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--cwd` | 当前目录 | 对方的工作目录，须为绝对路径 |
| `--session` | 新会话 | 传入上次输出的 `session_id` 以续接对话 |
| `--access` | `read-only` | `workspace-write` 允许修改 `cwd` 内文件；`operate` 用于 L2：跑命令、操作界面，同一时间只运行一个 |
| `--model` | — | 仅 claude 适配器使用；ZCode/dsh 用各自配置的默认模型 |

输出格式：回复正文，然后是 `---` 分隔的 `agent`、`session_id`、`duration`。失败时退出码为 1，错误和对方 CLI 的输出尾部写到 stderr。收到 SIGTERM/SIGINT（例如后台任务被停止）时会连带终止对方进程组。

## 权限映射

| `access` | ZCode | dsh | Claude |
|---|---|---|---|
| `read-only` | `--mode plan` | `DSH_PERMISSION_MODE=read-only` | `--permission-mode plan` |
| `workspace-write` | `--mode edit` | `DSH_PERMISSION_MODE=workspace-write` | `--permission-mode acceptEdits` |
| `operate` | `--mode guarded` | `DSH_PERMISSION_MODE=workspace-write` | `--permission-mode acceptEdits`（未实测） |

ZCode `-p` 默认是 `yolo`，dsh 默认是 `workspace-write`；本工具总是显式传入上表的值，不使用 `yolo` 或 `danger-full-access`。

2026-10-20 实测边界：

| 操作 | ZCode `edit` | ZCode `guarded` | dsh `workspace-write` |
|---|---|---|---|
| 在 `cwd` 写文件、执行 `node -v` | 允许 | 允许 | 允许 |
| 写 `cwd` 之外的普通路径（`~/…`） | 拒绝：需审批而 `-p` 无审批方 | 未测；ZCode 只拦它判定为危险的命令 | 沙箱拒绝 |
| 写系统临时目录 `$TMPDIR` | 允许 | — | 允许（沙箱白名单） |
| 调 MCP 工具 `codex-computer-use`（计算器 2+3） | 拒绝：`mode.build.sideEffect` | 通过 | 通过 |

要点：

- dsh 的沙箱只约束 bash 的文件访问，不限网络，也不拦 MCP 工具，所以 dsh 在 `workspace-write` 下同样能操作界面；界面任务仍应使用 `operate`，以进入桌面锁。
- ZCode `-p` 不读取 `~/.zcode/cli/config.json` 的 `permission.allowedTools`（日志中的命中规则仍是 `mode.build.sideEffect`），白名单方案不可用。
- `operate` 任务先获取 `~/.agent-bridge/desktop.lock`，持有者退出、进程消失或超过“调用超时 + 60 秒”即释放；排队时 stderr 提示 `waiting`。

## 界面操作（L2）所需配置

| | MCP `codex-computer-use` | skill `codex-cua-jev` | 全局规则 |
|---|---|---|---|
| ZCode CLI | `~/.zcode/cli/config.json` 的 `mcp.servers`（桌面端用 `~/.zcode/mcp.json`，CLI 不读） | `~/.zcode/skills/codex-cua-jev` | `~/.zcode/AGENTS.md` → `~/.agents/AGENTS.md` |
| dsh | `~/.dsh/profiles/{headless,desktop}/cordis.patch.yml` 的 `mcp-codex-computer-use` | `~/.dsh/skills/codex-cua-jev` | 自动读取 `~/.agents/AGENTS.md` |

实测注意：本机系统语言为繁体中文，按英文名或 bundle id 定位应用；ZCode 侧 `cmd+q` 等快捷键未送达应用，需改用菜单；应用会保留上次的界面状态。

## 模型

不在本工具里指定。ZCode 使用 `~/.zcode/v2` 中选定的模型，dsh 使用 `~/.dsh/profiles/headless/cordis.patch.yml` 的 `agent-default-model`。2026-10-20 实测两边都走 magpie 供应商（`http://127.0.0.1:3425`）：ZCode 为 `opencode-zen-free/minimax-m3.1-flash-free`，dsh 为 `workbuddy-ai/deepseek-v4.1-flash`。

## 防递归

- `AGENT_BRIDGE_DEPTH` 随子进程环境逐层加一，达到 `AGENT_BRIDGE_MAX_DEPTH`（默认 2）即拒绝。
- dsh 会清洗传给 MCP 服务的环境，深度变量不可靠，所以另有全机在途调用计数 `~/.agent-bridge/inflight/`，超过 `AGENT_BRIDGE_MAX_INFLIGHT`（默认 3）即拒绝。并行派发超过 3 个任务时需要调大。

## 本机适配要点

- ZCode.app 内的 `glm/zcode.cjs` 直接运行会报“无法定位 CLI ZCode Built-in Provider Config”；适配器通过 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` 指向 `ZCode.app/Contents/Resources/config/provider/zcode-builtin.json`。
- dsh 用当前 node 直接执行其 `bin.js` 真实路径，避免 GUI 进程 PATH 中没有 node。
- 可用 `ZCODE_CLI`、`DSH_CLI`、`CLAUDE_CLI` 覆盖可执行文件位置。

## 测试

```bash
npm test                          # 解析器、权限映射、在途计数（不调用模型）
node scripts/smoke.mjs zcode dsh  # 经 MCP 客户端真实调用，两轮验证会话续接
```

## 注册与回滚

Claude Code（user 级）：

```bash
claude mcp add --scope user agent-bridge -e AGENT_BRIDGE_SELF=claude -- "$(command -v node)" "$PWD/src/server.mjs"
```

移除：`claude mcp remove --scope user agent-bridge`。首次注册前的配置备份在 `~/.agent-bridge/backups/`。

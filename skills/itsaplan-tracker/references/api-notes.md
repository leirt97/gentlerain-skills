# 接口要点

itsaplan 是本机 Docker 自托管实例，完整契约见 `GET <apiUrl>/docs/json`（OpenAPI）。

## 连接

- `~/.itsaplan/bootstrap.json`（权限 600）提供 `apiUrl`、`appUrl`、`agentKeys`、`adminApiKey`；其中的其他项目和 ID 是迁移时的快照，以接口为准。key 只在进程内使用，不写入命令行回显、日志、评论或文档。
- 读写事项一律用所在项目的 AI 代理 key：`agentKeys[<ref>]`。每个团队有一个 external 类型的 AI 代理「AI 助手」（大河湖 `@ai-dahehu`、蜂巢 `@ai-fengchao`），代理只能访问本团队的项目，所以按项目 ref 选 key；改动和评论都记在代理名下。项目列表取 `agentKeys` 的键。代理 key 不过期，泄露或失效时由管理员调用 `POST /teams/<teamId>/ai-agents/<agentId>/regenerate-key` 重新生成，并写回 `agentKeys`。
- `adminApiKey` 是管理员账号的 key，只用于代理管理、实例设置等代理没有权限的操作，不用于读写事项。它默认 90 天有效，当前 key 到 2027-01-20 过期；过期后返回 401，需在 Web 设置中新建 key 并写回。新增项目时，把项目加入本团队代理（`PUT /teams/<teamId>/ai-agents/<agentId>/projects`），并在 `agentKeys` 里补上该项目的 key。
- 请求头：`x-api-key: <key>`、`Origin: <appUrl>`。
- 速率限制按 key 计：两次请求间隔不超过 1 秒时计数累加，累计 100 次后拒绝，直到空闲超过 1 秒才清零。拒绝时 API 返回 500（日志为 429 `RATE_LIMITED`）。批量操作每约 90 个请求停 1.5 秒，遇 500 退避后重试；重试前确认写操作没有生效，避免重复发评论。

## 运维

- 服务未响应时执行 `sh scripts/start.sh`：按需启动 colima，在 `~/D/Projects/itsaplan` 拉起 compose 栈，等 api 和 web 健康后打印各服务状态和地址（Web `:3001`，API `:3000`），可重复执行。`docker compose down -v` 会删除数据卷。
- Web 管理员账号 `admin@itsaplan.local`，密码在 `~/.itsaplan/admin.env`（权限 600）。
- 数据在 Docker 卷 `postgres-data`（PostgreSQL）和 `minio-data`（附件）中；备份用 `pg_dump` 加卷快照。镜像使用 `latest` 标签，`docker compose pull` 升级后要重新核对状态列、字段和视图。

## ID 解析

列、字段、选项 ID 每次按名称从 `GET /projects/<ref>` 解析，不在文档或脚本里写死：`columns[].name` → 状态列 ID；`customFields[].name`（`原编号`、`事项类型`、`归属迭代`、`负责人`、`环境`、`严重程度`、`原优先级`）→ 字段 ID，其 `options[].value` → 选项 ID。

## 精简读取

接口原始响应很大：board 带每条待办的完整描述（一个项目数百 KB），`/docs/json` 是整份 OpenAPI。读取一律走精简输出：

- 查待办与字段：`scripts/list.mjs`（全部项目或 `--project`，按 `--number`、`--q`、`--field 名=值` 过滤），每条一行，不含描述。
- 评论：`GET /issues/<id>/feed?filter=comments&limit=<n>`，默认新的在前，只取需要的条数。
- 接口契约：用 `jq` 或脚本从 `/docs/json` 截取单个 path，不读全文。
- 自写脚本处理 board 时在进程内筛选，只打印结论。

## 读写

- `GET /projects/<ref>/issues/board` 是唯一带 `fieldValues` 的列表接口；`GET /projects/<ref>/issues` 是轻量搜索，不返回 `fieldValues`。单条 `GET /issues/<id>` 的 `fields` 带字段名。
- 新建：`POST /projects/<ref>/issues`，必填 `columnId`、`title`；之后逐个字段 `PUT /issues/<id>/fields/<fieldId>`，文本/数字 body 为 `{"value": ...}`，单选为 `{"optionIds": [<id>]}`。批量更新接口不支持自定义字段。
- 改状态：`PATCH /issues/<id>`，body `{"columnId": <id>}`。目标列达到硬 WIP 上限时返回 409。
- 评论：`POST /issues/<id>/comments`，body `{"body": "...", "replyToId"?: <commentId>}`，上限 50000 字符；读取用 `GET /issues/<id>/feed`（评论与变更记录，默认新的在前）。
- 附件：`POST /issues/<id>/attachments`，`multipart/form-data` 字段 `file`；上限为实例设置 `maxAttachmentMb`，超限返回 413。回读 `GET /issues/<id>/attachments`。事项附件 URL 在 localhost 上无需登录即可访问。嵌入描述或评论时写成 `![说明](/media/attachments/<id>/raw)`，与 Web 编辑器存储的形式一致：Web 端的 `/media` 路由经容器内网向 API 取文件，链接不依赖端口和域名。接口返回的 `url`（`/attachments/<id>/raw`）不能直接嵌入，Web 端会把它跳转到 `/login`；拼上 `apiUrl` 的绝对地址在 API 端口变化后失效。
- `原优先级` 与内置 `priority` 的对应：1→urgent、2→high、3→medium、4/5→low。

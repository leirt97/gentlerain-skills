# 接口要点

itsaplan 是本机 Docker 自托管实例，完整契约见 `GET <apiUrl>/docs/json`（OpenAPI）。

## 连接

- `~/.itsaplan/bootstrap.json`（权限 600）提供 `apiUrl`、`appUrl`、`apiKey` 和项目 ref（顶层 `projectRef` 及 `products.*.projectRef`）。key 只在进程内使用，不写入命令行回显、日志、评论或文档。
- 请求头：`x-api-key: <apiKey>`、`Origin: <appUrl>`。
- 服务未响应时先 `colima start`，再在 `/Users/cutesunday/D/Projects/itsaplan` 执行 `docker compose up -d`。`docker compose down -v` 会删除数据卷。
- API key 有速率限制，超限时返回 500（日志中为 429 `RATE_LIMITED`）；批量写入要退避重试。

## ID 解析

列、字段、选项 ID 每次按名称从 `GET /projects/<ref>` 解析，不在文档或脚本里写死：`columns[].name` → 状态列 ID；`customFields[].name`（`原编号`、`事项类型`、`归属迭代`、`负责人`、`环境`、`严重程度`、`原优先级`）→ 字段 ID，其 `options[].value` → 选项 ID。

## 读写

- 读字段值用 `GET /projects/<ref>/issues/board`（含 `fieldValues`）；`GET /projects/<ref>/issues` 是轻量搜索，不返回 `fieldValues`。
- 新建：`POST /projects/<ref>/issues`，必填 `columnId`、`title`；之后逐个字段 `PUT /issues/<id>/fields/<fieldId>`，文本/数字 body 为 `{"value": ...}`，单选为 `{"optionIds": [<id>]}`。批量更新接口不支持自定义字段。
- 改状态：`PATCH /issues/<id>`，body `{"columnId": <id>}`。目标列达到硬 WIP 上限时返回 409。
- 评论：`POST /issues/<id>/comments`，body `{"body": "...", "replyToId"?: <commentId>}`，上限 50000 字符；读取用 `GET /issues/<id>/feed`（评论与变更记录，默认新的在前）。
- 附件：`POST /issues/<id>/attachments`，`multipart/form-data` 字段 `file`；上限为实例设置 `maxAttachmentMb`，超限返回 413。回读 `GET /issues/<id>/attachments`。事项附件 URL 在 localhost 上无需登录即可访问。
- `原优先级` 与内置 `priority` 的对应：1→urgent、2→high、3→medium、4/5→low。

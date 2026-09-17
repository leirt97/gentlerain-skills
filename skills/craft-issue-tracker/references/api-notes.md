# API 边界与注意事项

## 合集创建边界

Craft API 的 `POST /collections` 是实验性接口，可在指定文档中创建基础原生合集并定义 schema；`craft-api.mjs` 当前 CLI 未封装该命令，但 CLI 缺少命令不等于 Craft API 不支持。创建文档可用 `POST /documents`，创建合集时提供 schema 和 `position.pageId`。

基础合集创建、字段定义和条目读写优先使用 API，并用 schema、条目或块回读证明结果。模板副本、表格/看板等视图配置是否可由 API 完整表达，须按当前接口实际能力判断；API 未暴露或无法回读证明的配置，才交给已获授权的 UI 流程，并单独报告 UI 验收，不把两者混为一个能力结论。

- items 主标题字段可能由 `contentPropDetails.key` 指定；字段修改后 key 可漂移，包括空字符串 key。
- POST 多个独立 blocks 用于分段；PUT 单块的 markdown 必须只解析成一个块。
- Markdown 中 `<Object>` 等可能被识别为 HTML 的原文应转义或用代码格式保留。
- 单选值先读 options，去重后补齐缺失值再复用，保留已有绑定数据。
- 移动块优先保留原 ID。

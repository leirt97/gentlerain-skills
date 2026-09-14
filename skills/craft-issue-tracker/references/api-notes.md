# API 注意事项

- items 主标题字段可能由 `contentPropDetails.key` 指定；字段修改后 key 可漂移，包括空字符串 key。
- POST 多个独立 blocks 用于分段；PUT 单块的 markdown 必须只解析成一个块。
- Markdown 中 `<Object>` 等可能被识别为 HTML 的原文应转义或用代码格式保留。
- 单选值先读 options，去重后补齐缺失值再复用，保留已有绑定数据。
- 移动块优先保留原 ID。

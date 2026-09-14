---
name: rename-material-assets
description: Extract UI slice archives, compare slices with the original UI screenshots, and rename the output folders and image assets with semantic English kebab-case names. Use when the user provides a directory and says "重命名素材", "rename materials", or asks for semantic renaming of UI slices.
---

# Rename Material Assets

只处理用户给定目录及其解压子目录；未指定路径时使用当前工作目录。

## Workflow

1. 寻找 `*_slices.zip` 及对应的原始 UI 图（PNG、WEBP、JPG 或 JPEG）。
2. 按压缩包原名在同级创建临时解压目录，优先使用 `bsdtar -xf` 解压，以正确处理中文条目。保留原始 UI 图和 ZIP，不覆盖或删除它们。
3. 对照原始 UI 图与切图，按实际位置、功能和角色建立一一对应的语义映射，不根据图层编号猜名称。相同图形按不同位置分别命名；视觉上仍无法可靠区分时询问用户。
4. 只重命名解压目录中的图片：使用小写英文 kebab-case，匹配 `^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+$`；去掉中文图层名、空格和 `@2x` 后缀，保留原扩展名和图片内容。
5. 按页面语义将解压目录改为英文 kebab-case `<english-page-name>-slices/`。校验目录名、文件数量、图片可读性、文件名格式和重名情况，并确认原始文件仍在；报告输出目录和处理数量。

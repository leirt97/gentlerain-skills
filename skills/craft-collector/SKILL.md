---
name: craft-collector
description: 收藏推文/X帖子、网页文章、工具技巧、技术贴或灵感内容到 Craft 的「收藏 Collection」目录。当用户提供链接要求“收藏这个”、“存到 Craft”、“保存到收藏夹”、“收藏推文”、“收藏网页”时触发。
---

# 收藏到 Craft (craft-collector)

将外部内容（推文、网页、文章、开源工具、技术技巧）整理并持久化保存到 Craft 的「收藏 Collection」文件夹中。

## 目标与位置

- **目标文件夹**：`收藏 Collection`
  - Folder ID: `8C602708-9CB6-4309-A7C2-534509052E30`
- **Craft 接入环境**：
  - 脚本与凭证位于：`/Users/cutesunday/D/Craft/craft-api.mjs`
  - 环境变量文件：`/Users/cutesunday/D/Craft/.env.local`
  - 执行命令前必须先加载：`source /Users/cutesunday/D/Craft/.env.local`

## 标签决策规则（严禁新建标签）

所有标签**必须**从 Craft 既有的「标签维度 Tag Namespace」中挑选，严格禁止发明新标签。标签置于文档首行的 `<callout>` 内，标准格式为：

```markdown
<callout>#领域/<值>  #类型/<值>  #状态/<值>  [#用于/<值>]</callout>
```

### 1. 领域（单选，按主题匹配）
- `#领域/前端`：前端开发、CSS/JS 技巧、UI 组件、浏览器机制
- `#领域/ai`：大模型、Agent、AI 工具、Prompt、绘图与视频生成
- `#领域/系统`：架构、后端、Linux、网络、运维、基础设施
- `#领域/计算机`：计算机科学底层、算法、语言规范
- `#领域/知识管理`：笔记法、标签体系、知识库、工作流
- `#领域/思维模型`：认知模型、商业思维、决策框架
- `#领域/设计`：UI/UX 设计、排版、美学、动效
- `#领域/装修`：居家设计、收纳、家装材料与工艺
- `#领域/美食`：烹饪、探店、食谱

### 2. 类型（单选，按内容属性与定义匹配）
- `#类型/方法`：**一套系统的步骤或程序，用于解决特定问题**；分享和帮助习得应用与践行方式（如：CSS 技巧、配置步骤、实操指南、排错方案）。
- `#类型/工具`：软件、开源项目、CLI、脚本、扩展程序、平台。
- `#类型/原理`：**基本的理论或基础性规律**；科学依据、运行机制、底层规范。
- `#类型/概念`：**抽象的思想或定义**；领域基本认知单元。
- `#类型/案例`：具体的实例或事例，配合说明某种方法或真实记录。
- `#类型/观点`：个体的立场、看法、信念或独特视角。
- `#类型/感受`：内在主观体验、情绪、共鸣。
- `#类型/故事`：叙事性情节、经历。

### 3. 状态（单选）
- `#状态/备用`：**默认收藏状态**，暂存备用、待查阅参考。
- `#状态/稳定`：已充分验证、成熟完备的长期参考内容。
- `#状态/待完善`：信息有缺失、需要后续补充的内容。

### 4. 用于（可选）
- `#用于/学习`：用于个人学习、技能提升。
- `#用于/写作`：作为写作素材或引用出处。

---

## 执行步骤

### Step 1: 抓取与解析内容

#### 1. Twitter / X 链接
- 从链接中提取用户名与推文 ID（例如 `https://x.com/{user}/status/{id}`）。
- 优先通过 fxtwitter API 读取纯净结构体：
  ```bash
  curl -s "https://api.fxtwitter.com/{user}/status/{id}"
  ```
- 提取要素：作者全名、账号（@handle）、推文完整正文、发布时间、视频直链或高清图片链接。

#### 2. 其它网页 / 技术文章
- 使用 Fetch / Readability 获取文章标题、作者、核心摘要与代码块、原文链接。

---

### Step 2: 拟定标题与排版格式

- **文档标题（Title）**：凝练中文 + 核心英文词，突出解决的问题或主题（例如 `CSS 技巧：使用 scrollbar-gutter 避免滚动条出现时的页面抖动`）。
- **文档正文结构规范**：
  ```markdown
  <callout>#领域/xxx  #类型/xxx  #状态/备用</callout>

  <callout>来源：[作者/标题 on 平台](原文URL)</callout>

  ### 核心内容

  （提炼 1-3 句中文核心要点，配代码块或关键步骤）

  ### 原文

  > **作者 (@handle)**
  > 
  > 原推或原文重点引用...

  ### 附件 / 媒体链接
  - [资源名称](媒体直链)
  ```

---

### Step 3: 创建文档与写入 Craft

进入 `/Users/cutesunday/D/Craft` 目录执行写入：

```bash
cd /Users/cutesunday/D/Craft
source .env.local

# 1. 在「收藏 Collection」文件夹创建新页面
node -e '
import("./craft-api.mjs").then(async ({ buildClient, craftRequest }) => {
  const client = buildClient();
  const folderId = "8C602708-9CB6-4309-A7C2-534509052E30";
  const title = process.argv[1];
  const markdown = process.argv[2];

  const res = await craftRequest(client, "POST", "/documents", {
    body: {
      documents: [{ title }],
      destination: { folderId }
    }
  });
  const pageId = res.items[0].id;

  await craftRequest(client, "POST", "/blocks", {
    body: {
      markdown,
      position: { position: "end", pageId }
    }
  });

  console.log("CREATED_ID:" + pageId);
});
' "<文档标题>" "<Markdown正文>"
```

---

### Step 4: 校验与完成标准（Completion Criteria）

1. 读取生成的文档根块（`node craft-api.mjs blocks --id '<pageId>' --maxDepth 2`）。
2. 验证满足四项契约：
   - 首行包含合法的现有标签 Callout；
   - 包含可点击的来源 Callout 链接；
   - 包含提取后的核心内容与原帖引用；
   - 目标位于 `收藏 Collection` 文件夹内。
3. 反馈给用户：文档标题、选用的标签及理由、Craft 链接或 ID。

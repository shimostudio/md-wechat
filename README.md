# MD公众号排版


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![构建](https://github.com/shimostudio/md-wechat/actions/workflows/ci.yml/badge.svg)](https://github.com/shimostudio/md-wechat/actions/workflows/ci.yml)

面向公众号写作者的 Markdown 排版工具：左边写 Markdown，右边实时预览公众号效果；文章归档后可生成一个不依赖本机数据的公开排版页，手机打开即可复制富文本。

<img width="5104" height="2390" alt="image" src="https://github.com/user-attachments/assets/5396e2d0-a417-48b7-9b01-848a4d24eeae" />

## 功能

- Markdown 实时渲染，编辑器与预览同步滚动
- 26 套排版主题一键换肤，悬停卡片即可实时试看；每套主色可自定义，部分主题的辅色可单独调整
- 字号、字体可调，支持按主题覆盖自定义 CSS
- 图片画廊三种模式：**拼贴**（主图 + 右列裁切填充，拖拽边界自由微调、底边始终齐平）、**网格**（1:1 / 4:5 / 3:4 统一裁切，公众号后台实测支持）、**单列**
- 剪贴板/拖放/文件选择三种方式插入图片，字节存本地 IndexedDB，文档只留短引用，复制到公众号时自动还原
- 视频处理：本地视频预览可播放；复制时 ≤7.5MB 的视频内联带走（按公众号正文 10M 上限反推），更大的自动转为带文件名的占位卡，粘贴后在公众号后台插入真视频（视频不像图片会被微信转存，必须走后台上传转码审核——平台限制，非工具问题）
- 代码块高亮（22 种常用语言，样式全部内联）、表格、嵌套引用、分割线等完整语法支持
- 满屏 / 手机 / 桌面三种预览比例，手机样机框接近真机效果
- 多文档管理、回收站、本地自动保存
- 导入 / 导出 Markdown，随时备份文章
- 顶栏「?」查看快捷键与操作提示（复制排版、保存、图片拖拽、段落定位等）

## 技术栈

- Vue 3 + Vite
- CodeMirror 6（编辑器）
- markdown-it + highlight.js（渲染与代码高亮，复制时样式全部内联）
- 无后端：全部数据保存在浏览器本地（localStorage / IndexedDB），静态托管即可运行

## 安装与启动

### 方式一：一键启动（推荐给小白）

- **macOS**：双击 `start.command`（首次如提示无法打开，在文件上右键 → 打开）
- **Windows**：双击 `start.bat`（如弹出 SmartScreen，点「更多信息 → 仍要运行」）

脚本会自动检查 Node.js；如果电脑没装，会从国内镜像下载免安装版放到项目目录（`.node-runtime/`，不污染系统），然后装依赖、起服务、开浏览器，全程无需管理员权限。

### 方式二：手动

需要 Node.js 18 及以上。

```bash
npm install   # 安装依赖
npm run dev   # 启动开发服务器，默认 http://localhost:5173
```

## AI / MCP 接口

项目提供一个本地 MCP 服务，让支持 MCP 的 AI 客户端直接操作当前打开的网页。由于文章和图片数据默认保存在浏览器本地，MCP 服务通过开发服务器的本地控制桥与网页通信，不会把文章上传到外部服务。

先启动网站并保持页面打开：

```bash
npm run dev
```

然后在另一个终端启动 MCP 服务：

```bash
npm run mcp
```

MCP 服务默认连接 `http://127.0.0.1:5173`，也可以通过 `MD_WECHAT_URL` 指定其他本地地址。可用工具包括：

- 读取、创建、修改、切换、重命名、删除和恢复文章
- 列出和切换 26 套排版主题
- 修改字号、字体、预览设备、画廊模式等安全设置
- 获取当前文章的公众号预览 HTML
- 载入内置示例文章、恢复最近一次备份
- 将 `{{IMAGE:01}}` 图片锚点导入浏览器本地图片库
- 调用网站现有复制逻辑，把富文本写入系统剪贴板

以支持 MCP 的客户端为例，stdio 配置如下：

```json
{
  "mcpServers": {
    "md-wechat": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/Users/shimo/项目/md-wechat"]
    }
  }
}
```

本地控制桥只监听 Vite 开发服务器的本机地址；图床供应商、Token 等敏感配置不会通过 MCP 读取或修改。健康检查地址为 `http://127.0.0.1:5173/__md_wechat/health`。

### Writer OS → md-wechat → 微信公众号草稿

Writer OS 文章正文可以保留 `{{IMAGE:01}}` 或 `<!-- IMAGE:01 -->` 图片锚点。然后调用 `md_wechat_import_assets`，为每个锚点传入本地图片的绝对路径：

```json
{
  "assets": [
    {
      "anchor": "01",
      "path": "/absolute/path/01.png",
      "alt": "概念示意图",
      "caption": "文章中的概念关系"
    }
  ]
}
```

导入完成后调用 `md_wechat_copy_rich_text`，再由浏览器操控能力把系统剪贴板粘贴到已登录的微信公众号草稿编辑器。该项目不会自动处理公众号登录、验证码，也不会自动点击“发布”或“群发”。

### Chrome 扩展：一键粘贴到三平台草稿

项目内置 `extension/` Chrome 扩展，支持微信公众号、抖音和小红书创作页面。先运行 `npm run dev:ensure`，再在 Chrome 的 `chrome://extensions/` 开启开发者模式，选择“加载已解压的扩展程序”并加载 `extension/` 文件夹。打开目标平台编辑页后点击扩展中的“粘贴并保存草稿”。扩展只读取 md-wechat 当前文章的标题、正文和图片，不读取登录态；只保存草稿，不点击发布、群发或提交审核。

### Writer OS → md-wechat → 平台草稿全流程

Writer OS 负责从一段思考生成文章、主封面、段落配图并归档；md-wechat 负责本地图片锚点替换、主题排版和发布 HTML；Chrome 扩展负责在已登录的平台创作页中填标题、粘贴正文、提交图片并保存草稿。

先保持 md-wechat 页面和目标平台编辑页打开，并确保 Chrome 扩展已加载，然后运行：

```bash
cd "/Users/shimo/项目/md-wechat"
npm run writer:publish -- "/绝对路径/Writer OS文章.md" --platform wechat
```

平台参数可用 `wechat`、`douyin` 或 `xiaohongshu`。命令会等待扩展回报草稿保存结果；如果页面未打开、图片缺失、标题不匹配或保存失败，会返回错误，不会伪造成功。该命令不负责替代 Writer OS 的文章写作和生图调用，Writer OS 完成归档后自动进入本流程。

### Writer OS → 公开排版页 → 手机复制

这是目前推荐的跨设备路径：Writer OS 生成文章、主封面和段落配图并归档后，将归档文章打包到 `public/articles/<slug>/`，再由你的服务器和域名提供访问。

```bash
cd "/Users/shimo/项目/md-wechat"
npm run writer:public -- "/绝对路径/Writer OS文章.md" --theme literary
```

生成后，将项目构建产物部署到你的服务器。公开页地址格式为：

```text
https://<GitHub用户名>.github.io/<仓库名>/?article=<URL编码后的slug>
```

手机打开这个地址，点击右上角「复制富文本」，再打开公众号助手粘贴并填写必要信息。该公开页只读取站点中的 `article.json` 和图片，不依赖原电脑的 localStorage / IndexedDB。

## 构建与测试

```bash
npm run build    # 构建生产版本到 dist/
npm run preview  # 本地预览构建产物
npm test         # 运行测试（node --test）
```

## 使用

1. 在左侧编辑器粘贴 Markdown，或点击「导入 Markdown」选择本地 .md 文件
2. 在右侧主题库选择主题，按需调整主色、辅色、字号
3. 点击「复制富文本」，到公众号后台粘贴即可发布

## 浏览器要求

推荐 Chrome / Edge，Safari 也能正常使用全部功能。

## 数据与隐私

- 纯前端应用，**无后端、无埋点、无账号体系**：文章、图片、设置全部保存在浏览器本地（localStorage / IndexedDB），不上传任何服务器
- 可选的「图床」功能（SM.MS / GitHub / 自定义接口）需要你主动配置 Token，凭据同样只存本机浏览器（明文 localStorage），仅在你手动触发上传时才会把媒体发往对应服务
- 关闭浏览器标签页或清理站点数据即可彻底抹除所有内容

## 在线版（可选）

纯静态产物（`npm run build` 输出 `dist/`），可以部署到你的服务器、Cloudflare Pages、Vercel 等任意静态托管。服务器方案待接入信息确认后再补充部署脚本和域名配置。

## 项目地址

https://github.com/shimostudio/md-wechat

## License

[MIT](LICENSE)

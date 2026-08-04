# MD公众号排版


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Pages](https://github.com/laogou717/md-wechat/actions/workflows/deploy.yml/badge.svg)](https://github.com/laogou717/md-wechat/actions/workflows/deploy.yml)

面向公众号写作者的 Markdown 排版工具：左边写 Markdown，右边实时预览公众号效果，一键复制富文本，直接粘贴进公众号后台，样式不丢失。

<img width="5104" height="2390" alt="image" src="https://github.com/user-attachments/assets/5396e2d0-a417-48b7-9b01-848a4d24eeae" />

## 功能

- Markdown 实时渲染，编辑器与预览同步滚动
- 26 套排版主题一键换肤，每套主色可自定义，部分主题的辅色可单独调整
- 字号、字体可调，支持按主题覆盖自定义 CSS
- 图片画廊拼贴（2 张起）、代码块高亮、表格、嵌套引用、分割线等完整语法支持
- 视频占位：`<video>`、视频平台 iframe、视频直链自动渲染为占位卡，粘贴后在公众号后台插入真视频
- 满屏 / 手机 / 桌面三种预览比例，手机样机框接近真机效果
- 多文档管理、回收站、本地自动保存
- 导入 / 导出 Markdown，可绑定本地文件夹自动同步存档

## 技术栈

- Vue 3 + Vite
- CodeMirror 6（编辑器）
- markdown-it + highlight.js（渲染与代码高亮，复制时样式全部内联）
- 无后端：全部数据保存在浏览器 localStorage

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

推荐 Chrome / Edge。粘贴复制、预览等核心功能在 Safari 也能用，但「文件夹同步存档」依赖 File System Access API，仅 Chromium 系浏览器支持。

## 在线版（可选）

仓库自带 GitHub Actions 工作流：在仓库 Settings → Pages 选择 GitHub Actions 来源后，push 到 main 分支即自动构建并发布，无需自己的服务器。

## 项目地址

https://github.com/laogou717/md-wechat

## License

[MIT](LICENSE)

#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const siteUrl = (process.env.MD_WECHAT_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
let lastHealthCheckAt = 0

async function ensureSiteReady() {
  if (Date.now() - lastHealthCheckAt < 1_000) return
  let response
  try {
    response = await fetch(`${siteUrl}/__md_wechat/health`, { cache: 'no-store' })
  } catch (error) {
    throw new Error(`无法连接 md-wechat ${siteUrl}：请先运行 npm run dev:ensure（${error.message}）`)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw new Error(`md-wechat 控制桥不可用：${siteUrl}`)
  if (!payload.browserConnected) {
    throw new Error(`md-wechat 已运行，但没有连接的本地排版页面：请只打开 ${siteUrl}/`)
  }
  lastHealthCheckAt = Date.now()
}


async function callSite(action, args = {}) {
  await ensureSiteReady()
  let response
  try {
    response = await fetch(`${siteUrl}/__md_wechat/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args }),
    })
  } catch (error) {
    throw new Error(`无法连接网站控制桥 ${siteUrl}：${error.message}`)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `网站控制桥返回 HTTP ${response.status}`)
  }
  return payload.result
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}

function registerControlTool(server, { name, description, inputSchema, action }) {
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try {
      return textResult(await callSite(action, args))
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message || String(error) }],
      }
    }
  })
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

async function prepareAsset(asset) {
  if (!asset || typeof asset !== 'object') throw new Error('每个 asset 必须是对象')
  if (typeof asset.data === 'string' && asset.data) return asset
  if (typeof asset.path !== 'string' || !asset.path) {
    throw new Error(`图片 ${asset.anchor || ''} 缺少 data 或 path`)
  }
  const buffer = await readFile(asset.path)
  const extension = extname(asset.path).toLowerCase()
  return {
    ...asset,
    filename: asset.filename || asset.path.split('/').pop(),
    mimeType: asset.mimeType || MIME_BY_EXT[extension] || 'application/octet-stream',
    data: buffer.toString('base64'),
  }
}

const server = new McpServer({
  name: 'md-wechat',
  version: '0.1.0',
})

registerControlTool(server, {
  name: 'md_wechat_get_state',
  description: '读取 MD公众号排版 当前文章、文档库、回收站、主题和安全的显示设置。默认不返回完整正文。',
  inputSchema: {
    includeContent: z.boolean().optional().describe('是否同时返回当前文章正文'),
    includeHtml: z.boolean().optional().describe('是否同时返回当前预览 HTML'),
  },
  action: 'get_state',
})

registerControlTool(server, {
  name: 'md_wechat_list_documents',
  description: '列出文章库和回收站中的文章摘要，并返回当前选中文章 ID。',
  inputSchema: {},
  action: 'list_documents',
})

registerControlTool(server, {
  name: 'md_wechat_get_document',
  description: '读取指定文章的完整 Markdown 正文；不传 documentId 时读取当前文章。',
  inputSchema: { documentId: z.string().optional() },
  action: 'get_document',
})

registerControlTool(server, {
  name: 'md_wechat_set_document',
  description: '替换指定文章的 Markdown 正文并保存到浏览器本地。',
  inputSchema: {
    content: z.string().describe('完整 Markdown 正文，最大 5 MB'),
    documentId: z.string().optional().describe('目标文章 ID；不传时使用当前文章'),
  },
  action: 'set_document',
})

registerControlTool(server, {
  name: 'md_wechat_create_document',
  description: '新建文章并切换为当前文章。发布流程优先使用 md_wechat_prepare_article，避免重复创建。',
  inputSchema: {
    content: z.string().optional(),
    title: z.string().optional(),
  },
  action: 'create_document',
})

registerControlTool(server, {
  name: 'md_wechat_upsert_document',
  description: '按 documentId 或一级标题幂等创建/更新文章；已有同名文章时更新最近一篇，不重复创建。',
  inputSchema: {
    content: z.string().describe('完整 Markdown 正文，最大 5 MB'),
    title: z.string().optional().describe('文章标题；默认从一级标题读取'),
    documentId: z.string().optional().describe('已知文档 ID；不传时按标题匹配'),
  },
  action: 'upsert_document',
})

registerControlTool(server, {
  name: 'md_wechat_prepare_article',
  description: '一次性幂等载入文章、批量导入图片、设置主题和预览，并返回可校验的预览结果。',
  inputSchema: {
    content: z.string().describe('保留 {{IMAGE:01}} / <!-- IMAGE:01 --> 锚点的 Markdown 正文'),
    title: z.string().optional(),
    documentId: z.string().optional(),
    themeId: z.string().optional(),
    settings: z.object({
      fontSize: z.number().optional(),
      fontFamily: z.enum(['theme', 'serif', 'sans', 'mono']).optional(),
      macCode: z.boolean().optional(),
      previewWidth: z.enum(['full', 'mobile', 'desktop']).optional(),
      editorPct: z.number().optional(),
      viewMode: z.enum(['split', 'preview']).optional(),
      galleryMode: z.enum(['collage', 'grid', 'stack']).optional(),
      galleryRatio: z.enum(['1:1', '4:5', '3:4']).optional(),
    }).strict().optional(),
    assets: z.array(z.object({
      anchor: z.string().min(1),
      path: z.string().optional(),
      data: z.string().optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
    })).optional(),
  },
}, async ({ content, title, documentId, themeId, settings, assets = [] }) => {
  try {
    const preparedAssets = await Promise.all(assets.map(prepareAsset))
    return textResult(await callSite('prepare_article', {
      content, title, documentId, themeId, settings, assets: preparedAssets,
    }))
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message || String(error) }] }
  }
})

registerControlTool(server, {
  name: 'md_wechat_select_document',
  description: '切换当前文章。',
  inputSchema: { documentId: z.string() },
  action: 'select_document',
})

registerControlTool(server, {
  name: 'md_wechat_rename_document',
  description: '修改文章的一级标题；没有一级标题时会自动添加。',
  inputSchema: {
    documentId: z.string().optional(),
    title: z.string().min(1),
  },
  action: 'rename_document',
})

registerControlTool(server, {
  name: 'md_wechat_delete_document',
  description: '把文章移入回收站。',
  inputSchema: { documentId: z.string().optional() },
  action: 'delete_document',
})

registerControlTool(server, {
  name: 'md_wechat_restore_from_trash',
  description: '从回收站恢复文章，并切换到恢复的文章。',
  inputSchema: { documentId: z.string() },
  action: 'restore_from_trash',
})

registerControlTool(server, {
  name: 'md_wechat_remove_from_trash',
  description: '永久删除回收站中的文章。此操作不可恢复。',
  inputSchema: { documentId: z.string() },
  action: 'remove_from_trash',
})

registerControlTool(server, {
  name: 'md_wechat_list_themes',
  description: '列出网站可用的排版主题。',
  inputSchema: {},
  action: 'list_themes',
})

registerControlTool(server, {
  name: 'md_wechat_set_theme',
  description: '切换排版主题，可选地设置该主题的主色和辅色。',
  inputSchema: {
    themeId: z.string(),
    accent: z.string().nullable().optional(),
    slotColors: z.record(z.string(), z.string().nullable()).optional(),
  },
  action: 'set_theme',
})

registerControlTool(server, {
  name: 'md_wechat_set_settings',
  description: '修改安全的显示和排版设置；图床供应商、Token 等敏感配置不在接口范围内。',
  inputSchema: {
    settings: z.object({
      fontSize: z.number().optional(),
      fontFamily: z.enum(['theme', 'serif', 'sans', 'mono']).optional(),
      macCode: z.boolean().optional(),
      previewWidth: z.enum(['full', 'mobile', 'desktop']).optional(),
      editorPct: z.number().optional(),
      viewMode: z.enum(['split', 'preview']).optional(),
      galleryMode: z.enum(['collage', 'grid', 'stack']).optional(),
      galleryRatio: z.enum(['1:1', '4:5', '3:4']).optional(),
    }).strict(),
  },
  action: 'set_settings',
})

registerControlTool(server, {
  name: 'md_wechat_render_preview',
  description: '按当前主题和设置渲染当前文章，返回可用于后续发布流程的 HTML。',
  inputSchema: {},
  action: 'render_preview',
})

registerControlTool(server, {
  name: 'md_wechat_load_sample',
  description: '载入内置示例文章，并作为新文章保存。',
  inputSchema: { sampleId: z.string() },
  action: 'load_sample',
})

registerControlTool(server, {
  name: 'md_wechat_restore_backup',
  description: '恢复最近一次被替换前的文章版本。',
  inputSchema: {},
  action: 'restore_backup',
})

server.registerTool('md_wechat_import_assets', {
  description: '批量把 Writer OS 文章中的图片锚点替换为 md-wechat 本地图片。每个资源可传本地 path 或 base64 data。',
  inputSchema: {
    documentId: z.string().optional().describe('目标文章 ID；不传时使用当前文章'),
    assets: z.array(z.object({
      anchor: z.string().min(1),
      path: z.string().optional(),
      data: z.string().optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
    })).min(1),
  },
}, async ({ documentId, assets }) => {
  try {
    const preparedAssets = await Promise.all(assets.map(prepareAsset))
    const result = await callSite('import_assets', { documentId, assets: preparedAssets })
    return textResult({ ...result, count: result.imported?.length || 0 })
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error.message || String(error) }],
    }
  }
})

registerControlTool(server, {
  name: 'md_wechat_copy_rich_text',
  description: '调用网站现有复制逻辑，把当前文章的公众号富文本（含本地图片内联处理）写入系统剪贴板。',
  inputSchema: { expectedTitle: z.string().optional().describe('复制前校验当前文章标题') },
  action: 'copy_rich_text',
})

registerControlTool(server, {
  name: 'md_wechat_validate_article',
  description: '检查当前文章标题、图片锚点和本地媒体引用是否完整，复制前使用。',
  inputSchema: { expectedTitle: z.string().optional() },
  action: 'validate_article',
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`md-wechat MCP server connected to ${siteUrl}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

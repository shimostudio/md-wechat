#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteUrl = 'http://127.0.0.1:5173'
const platformNames = { wechat: '微信公众号', douyin: '抖音', xiaohongshu: '小红书' }

function usage() {
  console.error('用法：node scripts/writer-publish.mjs <Writer OS文章.md> --platform wechat|douyin|xiaohongshu')
  process.exit(1)
}

const articlePath = process.argv[2]
const platformIndex = process.argv.indexOf('--platform')
const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : 'wechat'
if (!articlePath || !platformNames[platform]) usage()

async function ensureSite() {
  try {
    const response = await fetch(`${siteUrl}/__md_wechat/health`, { cache: 'no-store' })
    const payload = await response.json()
    if (payload.ok && payload.browserConnected) return
  } catch {}
  throw new Error(`请先在当前浏览器打开 ${siteUrl}/，再重新运行此命令`)
}

async function control(action, args) {
  const response = await fetch(`${siteUrl}/__md_wechat/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `md-wechat 操作失败：${action}`)
  return payload.result
}

async function queuePublishTask(task) {
  const response = await fetch(`${siteUrl}/__md_wechat/publish/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw new Error(payload.error || '发布任务排队失败')
  return payload.result
}

async function waitForPublishTask(taskId) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const response = await fetch(`${siteUrl}/__md_wechat/publish/status?taskId=${encodeURIComponent(taskId)}`)
    const payload = await response.json().catch(() => ({}))
    const status = payload.result
    if (status?.status === 'completed') {
      if (!status.result?.saved) throw new Error(`扩展未完成保存：${status.result?.error || '请检查目标平台编辑页'}`)
      return status.result
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
  }
  throw new Error('等待平台草稿保存超时：请确认 Chrome 扩展已重新加载，且目标平台编辑页保持打开')
}

function runPrepareScript() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['scripts/prepare-writer-article.mjs', resolve(articlePath)], { cwd: root })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `文章准备失败（${code}）`))
      else resolvePromise(JSON.parse(stdout))
    })
  })
}

await ensureSite()
const prepared = await runPrepareScript()
if (prepared.assets.some((asset) => !asset.path)) throw new Error('文章存在缺失图片路径，已停止发布')
const result = await control('prepare_article', {
  content: prepared.content,
  title: prepared.title,
  themeId: 'literary',
  settings: { previewWidth: 'mobile', galleryMode: 'collage' },
  assets: await Promise.all(prepared.assets.map(async (asset) => ({
    ...asset,
    data: (await readFile(asset.path)).toString('base64'),
  }))),
})
if (!result.validation?.valid) throw new Error(`文章校验失败：${(result.validation?.errors || []).join('；')}`)
const task = await queuePublishTask({ platform, expectedTitle: prepared.title })
console.log(`已完成 Writer OS → md-wechat：${prepared.title}`)
console.log(`已排队到${platformNames[platform]}，任务 ${task.id}`)
console.log('等待 Chrome 扩展粘贴并保存草稿…')
await waitForPublishTask(task.id)
console.log(`${platformNames[platform]}草稿已保存：${prepared.title}`)

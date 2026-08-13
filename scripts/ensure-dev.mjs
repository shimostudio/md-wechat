#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = 'http://127.0.0.1:5173'

async function check() {
  const response = await fetch(`${url}/__md_wechat/health`, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw new Error(`health check HTTP ${response.status}`)
  return payload
}

try {
  let payload
  try {
    payload = await check()
  } catch {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        payload = await check()
        break
      } catch {}
    }
  }
  if (!payload) throw new Error('启动后健康检查仍未通过')
  console.log(`${url} 已运行，控制桥已就绪。`)
  if (!payload.browserConnected) console.log(`请在同一浏览器中只打开 ${url}/`)
} catch (error) {
  console.error(`${url} 启动失败：${error.message}`)
  process.exit(1)
}

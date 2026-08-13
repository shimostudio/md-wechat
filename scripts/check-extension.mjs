import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../extension/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const requiredHosts = [
  'https://mp.weixin.qq.com/*',
  'https://creator.douyin.com/*',
  'https://creator.xiaohongshu.com/*',
]
for (const host of requiredHosts) {
  if (!manifest.host_permissions.includes(host)) throw new Error(`扩展缺少平台权限：${host}`)
}
if (!manifest.content_scripts?.[0]?.js?.includes('content/content.js')) throw new Error('扩展缺少平台内容脚本')
const files = [
  'background.js',
  'content/platforms.js',
  'content/content.js',
  'popup/popup.js',
]
for (const file of files) {
  const source = await readFile(new URL(file, root), 'utf8')
  if (/发布|群发|提交审核/.test(source) && !/保存/.test(source)) {
    throw new Error(`扩展脚本出现未受控的发布动作：${file}`)
  }
}
const adapterSource = await readFile(new URL('content/platforms.js', root), 'utf8')
for (const name of ['wechat', 'douyin', 'xiaohongshu']) {
  if (!adapterSource.includes(`${name}:`)) throw new Error(`缺少平台适配器：${name}`)
}
console.log(`Chrome 扩展检查通过：${files.length} 个脚本，3 个平台适配器`)

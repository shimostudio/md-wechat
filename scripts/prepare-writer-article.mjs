#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

function usage() {
  console.error('用法：node scripts/prepare-writer-article.mjs <article.md>')
  process.exit(1)
}

const inputPath = process.argv[2]
if (!inputPath) usage()

const articlePath = resolve(inputPath)
const source = await readFile(articlePath, 'utf8')
const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---\n?/)
const titleFromFrontmatter = frontmatterMatch?.[1]
  ?.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1]
  ?.trim()
const body = source.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/\n---\n\n## 原始思考\n\n>[\s\S]*$/, '').trim()
const title = titleFromFrontmatter || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
const assets = []
let content = body

for (let index = 1; index <= 20; index += 1) {
  const anchor = String(index).padStart(2, '0')
  const imagePattern = new RegExp(`!\\[([^\\]]*)\\]\\(assets/([^)]*-${anchor}\\.(?:png|jpe?g|webp|gif))\\)\\n\\n> ?([^\\n]*)`, 'i')
  const match = content.match(imagePattern)
  if (!match) continue
  const [, alt, filename, caption] = match
  const path = resolve(dirname(articlePath), 'assets', filename)
  assets.push({ anchor, path, filename: basename(path), alt, caption })
  content = content.replace(imagePattern, `{{IMAGE:${anchor}}}`)
}

console.log(JSON.stringify({ title, content, assets }, null, 2))

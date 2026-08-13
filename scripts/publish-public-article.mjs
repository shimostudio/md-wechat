#!/usr/bin/env node

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function usage() {
  console.error('用法：npm run writer:public -- <文章.md> [--theme literary] [--slug slug]')
  process.exitCode = 1
}

function parseArgs(argv) {
  const options = { theme: 'literary', slug: '' }
  const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--theme') options.theme = argv[++i] || options.theme
    else if (value === '--slug') options.slug = argv[++i] || options.slug
    else if (!value.startsWith('-')) positional.push(value)
  }
  return { articlePath: positional[0], ...options }
}

function basenameWithoutExtension(filePath) {
  return path.basename(filePath).replace(/\.(md|markdown|txt)$/i, '')
}

function safeSlug(value) {
  const slug = String(value || '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[?#%<>:"|*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) throw new Error('无法从文章文件名生成 slug，请使用 --slug 指定')
  return slug
}

function readFrontmatter(source) {
  const match = String(source).match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const fields = {}
  if (!match) return { fields, body: String(source) }
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/)
    if (!item) continue
    fields[item[1]] = item[2].replace(/^['"]|['"]$/g, '')
  }
  return { fields, body: String(source).slice(match[0].length) }
}

function cleanArticleBody(source, title) {
  let body = source
    .replace(/\r\n/g, '\n')
    .replace(/\n---\s*\n##\s*(原始思考|配图提示词)[\s\S]*$/i, '')
    .trim()
  if (!/^#\s+/.test(body)) body = `# ${title}\n\n${body}`
  return `${body}\n`
}

function assetNamesFrom(markdown, cover) {
  const names = new Set()
  const pattern = /assets\/([^\s)\]"'<>]+)/g
  for (const match of String(markdown).matchAll(pattern)) names.add(path.basename(match[1]))
  if (cover) names.add(path.basename(String(cover).replace(/^.*?assets\//, '')))
  return [...names].filter(Boolean)
}

async function publishArticle(articlePath, { theme, slug: requestedSlug }) {
  const absoluteArticlePath = path.resolve(articlePath)
  const source = await readFile(absoluteArticlePath, 'utf8')
  const { fields, body } = readFrontmatter(source)
  const title = String(fields.title || body.match(/^#\s+(.+)$/m)?.[1] || basenameWithoutExtension(absoluteArticlePath)).trim()
  const slug = safeSlug(requestedSlug || basenameWithoutExtension(absoluteArticlePath))
  const markdown = cleanArticleBody(body, title)
  const articleDir = path.join(projectRoot, 'public', 'articles', slug)
  const assetDir = path.join(articleDir, 'assets')
  const sourceAssetDir = path.join(path.dirname(absoluteArticlePath), 'assets')
  const names = assetNamesFrom(markdown, fields.cover_main)

  await rm(articleDir, { recursive: true, force: true })
  await mkdir(assetDir, { recursive: true })
  for (const name of names) {
    const sourcePath = path.join(sourceAssetDir, name)
    if (path.basename(sourcePath) !== name) throw new Error(`非法图片路径：${name}`)
    await copyFile(sourcePath, path.join(assetDir, name))
  }

  const packageData = {
    title,
    slug,
    themeId: theme,
    cover: fields.cover_main ? `assets/${path.basename(fields.cover_main)}` : '',
    markdown,
    generatedAt: new Date().toISOString(),
  }
  await writeFile(path.join(articleDir, 'article.json'), `${JSON.stringify(packageData, null, 2)}\n`)

  return {
    title,
    slug,
    assets: names,
    file: path.relative(projectRoot, path.join(articleDir, 'article.json')),
    query: encodeURIComponent(slug),
  }
}

const options = parseArgs(process.argv.slice(2))
if (!options.articlePath) usage()
else {
  try {
    const result = await publishArticle(options.articlePath, options)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(`公开文章生成失败：${error?.message || error}`)
    process.exitCode = 1
  }
}

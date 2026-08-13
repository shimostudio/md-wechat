#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generator = path.join(projectRoot, 'scripts', 'publish-public-article.mjs')

function parseArgs(argv) {
  const positional = []
  const options = []
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--theme' || value === '--slug') {
      options.push(value, argv[++i] || '')
    } else if (!value.startsWith('-')) {
      positional.push(value)
    }
  }
  return { articlePath: positional[0], options }
}

async function git(args) {
  return (await exec('git', args, { cwd: projectRoot, maxBuffer: 1024 * 1024 })).stdout.trim()
}

function parseRemote(remote) {
  const match = String(remote).match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`origin 不是 GitHub 仓库：${remote}`)
  return { owner: match[1], repo: match[2] }
}

const { articlePath, options } = parseArgs(process.argv.slice(2))
if (!articlePath) {
  console.error('用法：npm run writer:public:deploy -- <文章.md> [--theme literary] [--slug slug]')
  process.exit(1)
}

try {
  const generated = await exec(process.execPath, [generator, articlePath, ...options], {
    cwd: projectRoot,
    maxBuffer: 1024 * 1024,
  })
  const result = JSON.parse(generated.stdout)
  const articleDir = path.join('public', 'articles', result.slug)
  await git(['add', '--', articleDir])

  let changed = true
  try {
    await exec('git', ['diff', '--cached', '--quiet', '--', articleDir], { cwd: projectRoot })
    changed = false
  } catch {
    changed = true
  }

  if (changed) {
    await git(['commit', '-m', `content: publish ${result.title}`])
    await git(['push', 'origin', 'main'])
  }

  const remote = await git(['remote', 'get-url', 'origin'])
  const { owner, repo } = parseRemote(remote)
  const pageUrl = `https://${owner}.github.io/${repo}/?article=${result.query}`
  console.log(JSON.stringify({ ...result, changed, deployedBy: 'github-actions', url: pageUrl }, null, 2))
} catch (error) {
  const details = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || String(error)
  console.error(`公开文章部署失败：${details}`)
  process.exitCode = 1
}

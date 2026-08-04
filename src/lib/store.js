import { reactive, computed, watch } from 'vue'
import { themes } from './themes.js'
import { sample } from './sample.js'
import { setImageResolver } from './renderer.js'
import { getImageUrl, warmImageCache, pruneImages } from './imagedb.js'
import {
  archiveSupported,
  restoreHandle,
  pickDirectory,
  requestPermission,
  getActiveHandle,
  writeDocFile,
  removeDocFile,
  scanMarkdown,
} from './archive.js'

const KEYS = {
  content: 'wmd-content',
  backup: 'wmd-content-backup',
  theme: 'wmd-theme',
  settings: 'wmd-settings',
  docs: 'wmd-docs',
  activeDoc: 'wmd-active-doc',
  trash: 'wmd-trash',
  ui: 'wmd-ui',
}
const SETTINGS_VERSION = 10
const SAVE_DELAY = 250
const PREVIEW_MODES = new Set(['full', 'mobile', 'desktop'])

function normalizePreviewMode(value) {
  if (PREVIEW_MODES.has(value)) return value
  if (value === 'landscape') return 'desktop'

  const legacyWidth = Number(value)
  if (!Number.isFinite(legacyWidth)) return 'full'
  if (legacyWidth <= 480) return 'mobile'
  return 'desktop'
}

function normalizeThemeId(value) {
  return themes.some((item) => item.id === value) ? value : themes[0].id
}

function readRaw(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // 隐私模式、存储空间耗尽或存储被禁用时，不影响继续编辑。
    return false
  }
}

function load(key, fallback) {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function loadText(key, fallback) {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : fallback
  } catch {
    return raw // 兼容早期按纯文本存储的草稿
  }
}

function loadSettings() {
  const defaults = {
    fontSize: 16,
    fontFamily: 'theme',
    accentByTheme: {},
    accentSlotsByTheme: {},
    macCode: true,
    previewWidth: 'full',
    editorPct: 50,
    viewMode: 'split',
    sticker: '',
    galleryMode: 'collage',
    favoriteThemes: [],
    custom: {},
    v: SETTINGS_VERSION,
  }
  const saved = load(KEYS.settings, null)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults

  const savedVersion = Number(saved.v) || 0
  const settings = Object.assign({}, defaults, saved, { v: SETTINGS_VERSION })
  if (savedVersion < 2) {
    settings.editorPct = 50
  }
  if (savedVersion < 5) {
    // 迁移：预览默认回到完整工作区，手机和桌面保留为快捷设备视图。
    settings.previewWidth = 'full'
  }
  settings.previewWidth = normalizePreviewMode(settings.previewWidth)
  if (typeof saved.galleryMode !== 'string' || !saved.galleryMode) {
    settings.galleryMode = defaults.galleryMode
  }
  if (!['split', 'preview'].includes(settings.viewMode)) {
    // “写作”单栏视图已下线，统一回到对照视图。
    settings.viewMode = defaults.viewMode
  }
  if (savedVersion < 8 && (!saved.fontFamily || saved.fontFamily === 'sans')) {
    // 字体设置改为“跟随主题”优先；旧的默认黑体视为未做选择。
    settings.fontFamily = 'theme'
  }
  if (savedVersion < 10) {
    // 上传功能下线：清掉历史设置里遗留的图床凭据
    delete settings.imageHost
    delete settings.smmsToken
    delete settings.customHost
    delete settings.customToken
  }
  if (!settings.custom || typeof settings.custom !== 'object' || Array.isArray(settings.custom)) {
    settings.custom = {}
  } else if (savedVersion < 6) {
    const activeThemeIds = new Set(themes.map((item) => item.id))
    settings.custom = Object.fromEntries(
      Object.entries(settings.custom).filter(([themeId]) => activeThemeIds.has(themeId))
    )
  }
  // 收藏的主题列表：兜底为空数组，并清掉已不存在的主题
  if (!Array.isArray(settings.favoriteThemes)) {
    settings.favoriteThemes = []
  } else {
    const activeThemeIds = new Set(themes.map((item) => item.id))
    settings.favoriteThemes = settings.favoriteThemes.filter((id) => activeThemeIds.has(id))
  }
  if (
    !settings.accentByTheme ||
    typeof settings.accentByTheme !== 'object' ||
    Array.isArray(settings.accentByTheme)
  ) {
    settings.accentByTheme = {}
  }
  if (
    !settings.accentSlotsByTheme ||
    typeof settings.accentSlotsByTheme !== 'object' ||
    Array.isArray(settings.accentSlotsByTheme)
  ) {
    settings.accentSlotsByTheme = {}
  }
  if (savedVersion < 7 && typeof saved.accent === 'string' && saved.accent) {
    // 旧版强调色是全局值；迁移后只保留给当时唯一通过的“纸上散文”，
    // 避免它污染每套新主题各自完整的色彩系统。
    settings.accentByTheme = { ...settings.accentByTheme, literary: saved.accent }
  }
  delete settings.accent
  return settings
}

const savedThemeId = load(KEYS.theme, themes[0].id)
const initialThemeId = normalizeThemeId(savedThemeId)
if (initialThemeId !== savedThemeId) write(KEYS.theme, initialThemeId)

// 早期默认样章与新示例文章替换时，仅当存储内容仍是旧默认样章才迁移，
// 用户自己的文章不受影响。旧样章存入备份，可通过“恢复刚才的文档”找回。
// 名单也包含当前示例的标题：示例文更新后，内容不是最新版的旧示例会被替换，
// 与当前示例完全一致的文档不受影响（避免每次刷新重复迁移）。
const LEGACY_DEFAULT_SAMPLES = [
  '# 公众号排版助手',
  '# 让排版成为文章的衣裳',
  '# 一篇文章，压测全部 Markdown 排版细节',
  '# 沿着旧城，走完一个没有计划的下午',
  '# 我们如何把“写完”变成“可以发布”',
  '# 公众号太久没更新，我顺手写了个排版工具',
]
const storedMd = loadText(KEYS.content, sample)
const storedBackup = loadText(KEYS.backup, null)
const isLegacyDefault =
  LEGACY_DEFAULT_SAMPLES.some((title) => storedMd.trimStart().startsWith(title)) && storedMd !== sample
const initialMd = isLegacyDefault ? sample : storedMd
const initialBackup = isLegacyDefault ? storedMd : storedBackup
if (isLegacyDefault) {
  write(KEYS.content, initialMd)
  write(KEYS.backup, initialBackup)
}

// ---------- 多文档 ----------

export function docTitle(content) {
  const m = String(content || '').match(/^#\s+(.+?)\s*$/m)
  return (m?.[1] || '未命名文章').replace(/[*_`~[\]]/g, '').trim() || '未命名文章'
}

function makeDoc(content, now = Date.now()) {
  return {
    id: `doc-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    content: String(content ?? ''),
    createdAt: now,
    updatedAt: now,
  }
}

function loadDocs() {
  const saved = load(KEYS.docs, null)
  if (Array.isArray(saved) && saved.length && saved.every((d) => d && typeof d.content === 'string')) {
    // 旧示例文章随新样章下线：从文档库移入回收站（可恢复），不硬删。
    // 若用户在旧样章上做过自己的修改，也会进回收站而非丢失，可随时找回。
    // 内容与当前示例完全一致的文档保持不动，避免每次启动重复迁移。
    const kept = []
    const legacy = []
    for (const d of saved) {
      const isLegacy =
        d.content !== sample &&
        LEGACY_DEFAULT_SAMPLES.some((title) => d.content.trimStart().startsWith(title))
      ;(isLegacy ? legacy : kept).push(d)
    }
    if (legacy.length) {
      const trash = [...legacy.map((d) => ({ ...d, deletedAt: Date.now() })), ...load(KEYS.trash, [])]
      trash.length = Math.min(trash.length, 10)
      write(KEYS.trash, trash)
      // 迁移结果立刻落盘；否则下次启动会再次迁移，回收站被同一篇刷爆
      const next = kept.length ? kept : [makeDoc(initialMd)]
      write(KEYS.docs, next)
      const activeId = load(KEYS.activeDoc, null)
      if (!next.some((d) => d.id === activeId)) write(KEYS.activeDoc, next[0].id)
      return next
    }
    return saved
  }
  // 首迁：把单文档草稿变成第一篇文章
  return [makeDoc(initialMd)]
}

const initialDocs = loadDocs()
const savedActiveId = load(KEYS.activeDoc, null)
const initialActiveId = initialDocs.some((d) => d.id === savedActiveId) ? savedActiveId : initialDocs[0].id
const initialActiveDoc = initialDocs.find((d) => d.id === initialActiveId) || initialDocs[0]
const effectiveMd = initialActiveDoc.content

export const store = reactive({
  md: effectiveMd,
  backupMd: initialBackup,
  docs: initialDocs,
  activeDocId: initialActiveId,
  themeId: initialThemeId,
  // 悬浮主题面板悬停时的“试看”主题，不落盘；null 表示使用正式主题
  previewThemeId: null,
  settings: loadSettings(),
  lastSavedAt: null,
  trash: load(KEYS.trash, []),
  archive: { status: archiveSupported ? 'off' : 'unsupported', dirName: '' },
  // 面板开合（持久化）：三个面板均可独立开合；文档栏内部可切换文章与回收站视图。
  ui: (() => {
    const ui = Object.assign(
      {
        drawerOpen: false,
        documentView: 'documents',
        themePanelOpen: false,
        settingsPanelOpen: false,
      },
      load(KEYS.ui, {})
    )
    if (!['documents', 'trash'].includes(ui.documentView)) ui.documentView = 'documents'
    return ui
  })(),
  toast: '',
  // IndexedDB 图片缓存预热完成的信号：预热后 +1，触发预览重渲染
  imageCacheVersion: 0,
})

// 渲染器通过它把 local: 图片引用解析成内存中的 objectURL
setImageResolver((src) => getImageUrl(src.slice('local:'.length)))
warmImageCache().then(async () => {
  store.imageCacheVersion += 1
  // 启动时自动清理孤儿图片（回收站与备份里的引用保留）
  await pruneImages(usedImageIds()).catch(() => {})
})

// 所有存活文档（含回收站与备份）仍在引用的图片 id
export function usedImageIds() {
  const ids = new Set()
  const scan = (text) => {
    for (const m of String(text || '').matchAll(/local:(img-[a-z0-9]+)/g)) ids.add(m[1])
  }
  for (const d of store.docs) scan(d.content)
  for (const d of store.trash) scan(d.content)
  scan(store.backupMd)
  return [...ids]
}

export const theme = computed(() => themes.find((t) => t.id === store.themeId) || themes[0])
export const activeAccent = computed(
  () => store.settings.accentByTheme?.[store.themeId] || null
)

export function setActiveAccent(value) {
  const next = { ...(store.settings.accentByTheme || {}) }
  if (typeof value === 'string' && value) next[store.themeId] = value
  else delete next[store.themeId]
  store.settings.accentByTheme = next
}

export const activeSlotColors = computed(
  () => store.settings.accentSlotsByTheme?.[store.themeId] || {}
)

export function setSlotColor(key, value) {
  const all = { ...(store.settings.accentSlotsByTheme || {}) }
  const current = { ...(all[store.themeId] || {}) }
  if (typeof value === 'string' && value) current[key] = value
  else delete current[key]
  if (Object.keys(current).length) all[store.themeId] = current
  else delete all[store.themeId]
  store.settings.accentSlotsByTheme = all
}

let toastTimer = null
export function notify(msg) {
  store.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (store.toast = ''), 2400)
}

export function replaceDocument(next) {
  const nextMd = String(next ?? '')
  if (nextMd === store.md) return false

  store.backupMd = store.md
  write(KEYS.backup, store.backupMd)
  store.md = nextMd
  return true
}

export function restoreDocument() {
  if (typeof store.backupMd !== 'string') return false

  const current = store.md
  const previous = store.backupMd
  store.backupMd = current
  write(KEYS.backup, current)
  store.md = previous
  return true
}

// ---------- 多文档操作 ----------

function persistDocs() {
  const doc = store.docs.find((d) => d.id === store.activeDocId)
  if (doc) {
    if (doc.content !== store.md) doc.updatedAt = Date.now()
    doc.content = String(store.md ?? '')
  }
  write(KEYS.docs, store.docs)
  write(KEYS.content, String(store.md ?? ''))
  store.lastSavedAt = Date.now()
  if (doc) syncDocToArchive(doc)
}

export function createDocument(content = '# 未命名文章\n\n') {
  const doc = makeDoc(content)
  store.docs.push(doc)
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
  return doc
}

export function selectDocument(id) {
  if (id === store.activeDocId) return
  const doc = store.docs.find((d) => d.id === id)
  if (!doc) return
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
}

export function renameDocument(id, title) {
  const doc = store.docs.find((d) => d.id === id)
  const clean = String(title || '').trim()
  if (!doc || !clean) return
  const oldTitle = docTitle(doc.content)
  if (/^#\s+.+$/m.test(doc.content)) doc.content = doc.content.replace(/^#\s+.+$/m, `# ${clean}`)
  else doc.content = `# ${clean}\n\n${doc.content}`
  doc.updatedAt = Date.now()
  if (id === store.activeDocId) store.md = doc.content
  persistDocs()
  if (archiveOn()) {
    removeDocFile(getActiveHandle(), oldTitle).catch(() => {})
    writeDocFile(getActiveHandle(), docTitle(doc.content), doc.content).catch(() => {})
  }
}

// 删除进入回收站（最多保留 10 篇），可随时恢复
export function deleteDocument(id) {
  const idx = store.docs.findIndex((d) => d.id === id)
  if (idx === -1) return
  const [removed] = store.docs.splice(idx, 1)
  store.trash.unshift({ ...removed, deletedAt: Date.now() })
  if (store.trash.length > 10) store.trash.length = 10
  write(KEYS.trash, store.trash)
  if (archiveOn()) removeDocFile(getActiveHandle(), docTitle(removed.content)).catch(() => {})
  if (!store.docs.length) {
    createDocument()
    return
  }
  if (store.activeDocId === id) {
    const next = store.docs[Math.min(idx, store.docs.length - 1)]
    store.activeDocId = next.id
    store.md = next.content
    write(KEYS.activeDoc, next.id)
  }
  persistDocs()
}

export function restoreFromTrash(id) {
  const idx = store.trash.findIndex((d) => d.id === id)
  if (idx === -1) return
  const [doc] = store.trash.splice(idx, 1)
  write(KEYS.trash, store.trash)
  store.docs.push(doc)
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
}

export function removeFromTrash(id) {
  const idx = store.trash.findIndex((d) => d.id === id)
  if (idx === -1) return
  store.trash.splice(idx, 1)
  write(KEYS.trash, store.trash)
}

export function importContents(list, { select = true } = {}) {
  const docs = []
  for (const item of list) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) continue
    docs.push(makeDoc(item.content))
  }
  if (!docs.length) return []
  store.docs.push(...docs)
  if (select) {
    const last = docs[docs.length - 1]
    store.activeDocId = last.id
    store.md = last.content
    write(KEYS.activeDoc, last.id)
  }
  persistDocs()
  if (archiveOn()) {
    docs.forEach((d) => writeDocFile(getActiveHandle(), docTitle(d.content), d.content).catch(() => {}))
  }
  return docs
}

// ---------- 本地目录存档 ----------

function archiveOn() {
  return store.archive.status === 'on' && getActiveHandle()
}

let archiveSyncTimer = null
function syncDocToArchive(doc) {
  if (!archiveOn()) return
  clearTimeout(archiveSyncTimer)
  archiveSyncTimer = setTimeout(() => {
    writeDocFile(getActiveHandle(), docTitle(doc.content), doc.content).catch(() => {})
  }, 600)
}

export async function initArchive() {
  if (!archiveSupported) {
    store.archive.status = 'unsupported'
    return
  }
  const { status, handle } = await restoreHandle()
  store.archive.status = status
  if (handle) store.archive.dirName = handle.name
  if (status === 'on') await importArchiveFiles()
}

export async function enableArchive() {
  if (!archiveSupported) return false
  const handle = await pickDirectory()
  store.archive.status = 'on'
  store.archive.dirName = handle.name
  await importArchiveFiles()
  // 开启后把现有文章全量同步一次
  for (const d of store.docs) {
    await writeDocFile(handle, docTitle(d.content), d.content).catch(() => {})
  }
  return true
}

export async function reauthArchive() {
  const { handle } = await restoreHandle()
  if (!handle) {
    store.archive.status = 'off'
    return false
  }
  const ok = await requestPermission(handle)
  if (ok) {
    store.archive.status = 'on'
    store.archive.dirName = handle.name
    await importArchiveFiles()
  }
  return ok
}

async function importArchiveFiles() {
  const handle = getActiveHandle()
  if (!handle) return
  try {
    const files = await scanMarkdown(handle)
    const existing = new Set(store.docs.map((d) => docTitle(d.content)))
    const fresh = files.filter((f) => !existing.has(f.name.replace(/\.md$/i, '')))
    if (fresh.length) importContents(fresh, { select: false })
  } catch {
    // 目录不可读时静默跳过，不影响本地文档
  }
}

let contentTimer = null
let settingsTimer = null

watch(
  () => store.md,
  () => {
    clearTimeout(contentTimer)
    contentTimer = setTimeout(() => {
      persistDocs()
      contentTimer = null
    }, SAVE_DELAY)
  }
)

watch(
  () => store.themeId,
  (value) => write(KEYS.theme, value)
)

watch(
  () => store.ui,
  (value) => write(KEYS.ui, value),
  { deep: true }
)

watch(
  () => store.settings,
  (value) => {
    clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      write(KEYS.settings, value)
      settingsTimer = null
    }, SAVE_DELAY)
  },
  { deep: true }
)

// 页面在防抖窗口内关闭时，仍把最后一次输入同步落盘。
function flushPendingWrites() {
  if (contentTimer) {
    clearTimeout(contentTimer)
    contentTimer = null
    persistDocs()
  }
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
    write(KEYS.settings, store.settings)
  }
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', flushPendingWrites)
}

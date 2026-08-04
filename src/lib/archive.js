// 本地目录存档：File System Access API 选目录，目录句柄存 IndexedDB，
// 之后每次打开都能免重选地同步 .md 文件。仅 Chrome / Edge 支持，
// 其余浏览器降级为纯导入导出，不在此处报错。

export const archiveSupported =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window

const DB_NAME = 'wmd-archive'
const STORE = 'handles'
const DIR_KEY = 'archive-dir'

let activeHandle = null

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(value) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, DIR_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(DIR_KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export function getActiveHandle() {
  return activeHandle
}

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await idbPut(handle)
  activeHandle = handle
  return handle
}

// 启动时恢复：读 IndexedDB 里的句柄；返回 'on'（已授权）/ 'prompt'（待用户授权）/ 'off'
export async function restoreHandle() {
  try {
    const handle = await idbGet()
    if (!handle) return { status: 'off', handle: null }
    const granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
    if (granted) {
      activeHandle = handle
      return { status: 'on', handle }
    }
    return { status: 'prompt', handle }
  } catch {
    return { status: 'off', handle: null }
  }
}

// 权限处于 prompt 时，必须由用户手势触发重新授权
export async function requestPermission(handle) {
  const ok = (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  if (ok) activeHandle = handle
  return ok
}

export function docFilename(title) {
  const safe = String(title || '未命名文章').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50)
  return `${safe || '未命名文章'}.md`
}

export async function writeDocFile(handle, title, content) {
  const fileHandle = await handle.getFileHandle(docFilename(title), { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function removeDocFile(handle, title) {
  try {
    await handle.removeEntry(docFilename(title))
  } catch {
    // 文件可能从未同步过，忽略
  }
}

// 读取目录下全部 .md 文件（用于首次接入时导入已有存档）
export async function scanMarkdown(handle) {
  const files = []
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && /\.md$/i.test(name)) {
      const file = await entry.getFile()
      files.push({ name, content: await file.text() })
    }
  }
  return files
}

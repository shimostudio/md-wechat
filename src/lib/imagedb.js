// 图片库：粘贴的图片字节存 IndexedDB，文档里只留 local: 短引用。
// 渲染走内存 objectURL 缓存（渲染是同步的，IndexedDB 是异步的）；
// 复制到公众号前再把 local: 引用还原成 data URI。
const DB_NAME = 'md-wechat'
const STORE = 'images'
let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function putImage(id, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImage(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function allImageIds() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

// ---- objectURL 缓存：渲染器同步解析 local: 引用 ----
const objectUrls = new Map()

export function cacheImage(id, blob) {
  const old = objectUrls.get(id)
  if (old) URL.revokeObjectURL(old)
  objectUrls.set(id, URL.createObjectURL(blob))
}

export function getImageUrl(id) {
  return objectUrls.get(id) || null
}

// 启动时把库存图片预热进内存缓存
export async function warmImageCache() {
  try {
    const ids = await allImageIds()
    for (const id of ids) {
      if (!objectUrls.has(id)) {
        const blob = await getImage(id)
        if (blob) cacheImage(id, blob)
      }
    }
  } catch {
    // IndexedDB 不可用（如部分隐私模式）时静默降级，图片显示为占位
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

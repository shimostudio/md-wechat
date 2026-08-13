const PREFIX = '/__md_wechat'
const MAX_BODY_SIZE = 10 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 30_000
const OWNER_TIMEOUT_MS = 5_000

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error('请求内容超过 10 MB 限制'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function createBridgeState() {
  return {
    queue: [],
    pending: new Map(),
    nextId: 1,
    lastBrowserPollAt: 0,
    ownerId: null,
    ownerClaimedAt: 0,
    publishTask: null,
    publishHistory: new Map(),
  }
}

export function queuePublishTask(state, { platform, expectedTitle = '' } = {}) {
  const allowed = new Set(['wechat', 'douyin', 'xiaohongshu'])
  if (!allowed.has(platform)) throw new Error(`不支持的平台：${platform}`)
  if (state.publishTask) throw new Error(`已有发布任务等待处理：${state.publishTask.expectedTitle || state.publishTask.id}`)
  const task = {
    id: `publish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    platform,
    expectedTitle: String(expectedTitle || '').trim(),
    createdAt: Date.now(),
    inFlightAt: 0,
  }
  state.publishTask = task
  return { id: task.id, platform: task.platform, expectedTitle: task.expectedTitle }
}

export function takePublishTask(state, platform) {
  const task = state.publishTask
  if (!task || task.platform !== platform) return null
  if (task.inFlightAt && Date.now() - task.inFlightAt < COMMAND_TIMEOUT_MS) return null
  task.inFlightAt = Date.now()
  return { ...task }
}

export function finishPublishTask(state, taskId, result = {}) {
  if (!state.publishTask || state.publishTask.id !== taskId) throw new Error('发布任务不存在或已完成')
  const task = state.publishTask
  state.publishTask = null
  const completed = { id: task.id, platform: task.platform, expectedTitle: task.expectedTitle, ...result }
  state.publishHistory.set(task.id, completed)
  if (state.publishHistory.size > 20) state.publishHistory.delete(state.publishHistory.keys().next().value)
  return completed
}

export function getPublishTaskStatus(state, taskId) {
  if (state.publishTask?.id === taskId) return { status: 'queued', task: { ...state.publishTask } }
  const result = state.publishHistory.get(taskId)
  return result ? { status: 'completed', result } : { status: 'unknown', taskId }
}

function rejectPending(state, message) {
  for (const pending of state.pending.values()) pending.reject(new Error(message))
  state.pending.clear()
}

export function claimBrowser(state, clientId, { force = false } = {}) {
  const id = String(clientId || '').trim()
  if (!id) throw new Error('缺少浏览器 clientId')
  const ownerExpired = !state.ownerId || Date.now() - state.ownerClaimedAt > OWNER_TIMEOUT_MS
  if (!ownerExpired && state.ownerId !== id && !force) {
    throw new Error('已有其他本地排版页面连接；请只保留一个 127.0.0.1:5173 页面')
  }
  if (state.ownerId && state.ownerId !== id) {
    rejectPending(state, '本地排版页面已切换，请重试当前操作')
    state.queue.length = 0
  }
  state.ownerId = id
  state.ownerClaimedAt = Date.now()
  state.lastBrowserPollAt = Date.now()
  return { clientId: id, claimed: true }
}

function assertOwner(state, clientId) {
  const id = String(clientId || '').trim()
  if (!id || state.ownerId !== id || Date.now() - state.ownerClaimedAt > OWNER_TIMEOUT_MS) {
    throw new Error('本地排版页面连接已失效，请刷新 127.0.0.1:5173 后重试')
  }
  state.ownerClaimedAt = Date.now()
  return id
}

function enqueue(state, action, args) {
  if (!state.ownerId) throw new Error('尚未连接本地排版页面，请先打开 127.0.0.1:5173')
  const id = `cmd-${Date.now().toString(36)}-${state.nextId++}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id)
      reject(new Error('网页未在 30 秒内响应；请确认本地网站页面仍处于打开状态'))
    }, COMMAND_TIMEOUT_MS)
    state.pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        state.pending.delete(id)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        state.pending.delete(id)
        reject(error)
      },
    })
    state.queue.push({ id, action, args, ownerId: state.ownerId })
  })
}

export function mdWechatControlPlugin() {
  const state = createBridgeState()

  return {
    name: 'md-wechat-control-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (!url.pathname.startsWith(PREFIX)) return next()

        try {
          const origin = req.headers.origin || ''
          if (origin.startsWith('chrome-extension://') || !origin) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          }
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            return res.end()
          }
          if (req.method === 'POST' && url.pathname === `${PREFIX}/publish/queue`) {
            const raw = await readBody(req)
            const payload = raw ? JSON.parse(raw) : {}
            return sendJson(res, 200, { ok: true, result: queuePublishTask(state, payload) })
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/publish/next`) {
            const platform = url.searchParams.get('platform') || ''
            return sendJson(res, 200, { ok: true, result: takePublishTask(state, platform) })
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/publish/result`) {
            const raw = await readBody(req)
            const payload = raw ? JSON.parse(raw) : {}
            return sendJson(res, 200, { ok: true, result: finishPublishTask(state, payload.taskId, payload.result || {}) })
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/publish/status`) {
            return sendJson(res, 200, { ok: true, result: getPublishTaskStatus(state, url.searchParams.get('taskId') || '') })
          }
          if (req.method === 'GET' && url.pathname === `${PREFIX}/health`) {
            return sendJson(res, 200, {
              ok: true,
              service: 'md-wechat-control-bridge',
              browserConnected: Boolean(state.ownerId) && Date.now() - state.lastBrowserPollAt < OWNER_TIMEOUT_MS,
              ownerId: state.ownerId,
            })
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/commands/claim`) {
            const raw = await readBody(req)
            const payload = raw ? JSON.parse(raw) : {}
            return sendJson(res, 200, { ok: true, result: claimBrowser(state, payload.clientId, { force: payload.force !== false }) })
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/control`) {
            const raw = await readBody(req)
            const payload = raw ? JSON.parse(raw) : {}
            if (!payload || typeof payload.action !== 'string' || !payload.action) {
              return sendJson(res, 400, { ok: false, error: '缺少 action' })
            }
            const result = await enqueue(state, payload.action, payload.args || {})
            return sendJson(res, result.ok === false ? 400 : 200, result)
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/commands/next`) {
            const clientId = assertOwner(state, url.searchParams.get('clientId'))
            state.lastBrowserPollAt = Date.now()
            const command = state.queue.shift()
            if (!command) {
              res.statusCode = 204
              return res.end()
            }
            if (command.ownerId !== clientId) return sendJson(res, 409, { ok: false, error: '命令属于其他本地排版页面' })
            return sendJson(res, 200, command)
          }

          const resultPrefix = `${PREFIX}/commands/`
          if (req.method === 'POST' && url.pathname.startsWith(resultPrefix) && url.pathname.endsWith('/result')) {
            const id = url.pathname.slice(resultPrefix.length, -'/result'.length)
            const pending = state.pending.get(id)
            if (!pending) return sendJson(res, 404, { ok: false, error: '命令不存在或已超时' })
            assertOwner(state, url.searchParams.get('clientId'))
            const raw = await readBody(req)
            const result = raw ? JSON.parse(raw) : { ok: false, error: '空响应' }
            pending.resolve(result)
            return sendJson(res, 202, { ok: true })
          }

          return sendJson(res, 404, { ok: false, error: '未知控制桥路径' })
        } catch (error) {
          return sendJson(res, 400, { ok: false, error: error?.message || String(error) })
        }
      })
    },
  }
}

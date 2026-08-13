const COMMAND_PATH = '/__md_wechat/commands/next'
const RESULT_PATH = '/__md_wechat/commands'
const POLL_INTERVAL_MS = 250
const CLIENT_KEY = 'wmd-automation-client-id'

function getClientId() {
  try {
    const existing = window.sessionStorage?.getItem(CLIENT_KEY)
    if (existing) return existing
    const next = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    window.sessionStorage?.setItem(CLIENT_KEY, next)
    return next
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

async function claim(clientId) {
  const response = await fetch('/__md_wechat/commands/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, force: false }),
  })
  if (!response.ok) throw new Error('无法连接本地控制桥')
  return response.json()
}

async function postResult(command, payload) {
  try {
    await fetch(`${RESULT_PATH}/${encodeURIComponent(command.id)}/result?clientId=${encodeURIComponent(command.ownerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // 开发服务器重启或页面关闭时，结果无法回传，下一轮会自动恢复轮询。
  }
}

export function startAutomationBridge(execute) {
  if (typeof window === 'undefined' || typeof execute !== 'function') return () => {}

  let stopped = false
  let timer = null
  let busy = false
  const clientId = getClientId()

  const poll = async () => {
    if (stopped || busy) return
    busy = true
    try {
      const response = await fetch(`${COMMAND_PATH}?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      if (response.ok) {
        const command = await response.json()
        try {
          const result = await execute(command.action, command.args || {})
          await postResult(command, { ok: true, result })
        } catch (error) {
          await postResult(command, {
            ok: false,
            error: error?.message || String(error),
          })
        }
      }
    } catch {
      // 控制桥只在本地开发服务提供；页面离线时静默重试，不影响正常编辑。
    } finally {
      busy = false
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS)
    }
  }

  // 提供只读调试标记，方便浏览器控制台确认桥接是否已挂载。
  window.__MD_WECHAT_AUTOMATION__ = { connected: true, clientId }
  claim(clientId).then(poll).catch(() => {
    if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS * 4)
  })

  return () => {
    stopped = true
    if (timer) window.clearTimeout(timer)
    if (window.__MD_WECHAT_AUTOMATION__) delete window.__MD_WECHAT_AUTOMATION__
  }
}

const SITE = 'http://127.0.0.1:5173'

async function localJson(path, options = {}) {
  const response = await fetch(`${SITE}${path}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `本地桥接失败：${path}`)
  return payload.result
}

async function getPayload() {
  return localJson('/__md_wechat/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_publish_payload', args: {} }),
  })
}

async function getPublishTask(platform) {
  return localJson(`/__md_wechat/publish/next?platform=${encodeURIComponent(platform)}`)
}

async function finishPublishTask(taskId, result) {
  return localJson('/__md_wechat/publish/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, result }),
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_PUBLISH_PAYLOAD') {
    getPayload().then((result) => sendResponse({ ok: true, result })).catch((error) => {
      const text = error.message || String(error)
      sendResponse({ ok: false, error: text.includes('缺少本地图片') ? '图片缓存已过期，请刷新 md-wechat 排版页后重试' : text })
    })
    return true
  }
  if (message?.type === 'GET_PUBLISH_TASK') {
    getPublishTask(message.platform).then((result) => sendResponse({ ok: true, result })).catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) })
    })
    return true
  }
  if (message?.type === 'FINISH_PUBLISH_TASK') {
    finishPublishTask(message.taskId, message.result).then((result) => sendResponse({ ok: true, result })).catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) })
    })
    return true
  }
  return false
})

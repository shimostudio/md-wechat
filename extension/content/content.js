(function () {
  function adapter() {
    return Object.values(window.SHiMOPlatformAdapters || {}).find((item) => item.matches()) || null
  }

  let polling = false
  let lastTaskId = ''

  async function pollPublishTask() {
    if (polling) return
    const current = adapter()
    if (!current || !current.isEditor?.()) return
    polling = true
    try {
      const taskResponse = await chrome.runtime.sendMessage({ type: 'GET_PUBLISH_TASK', platform: current.key })
      const task = taskResponse?.ok ? taskResponse.result : null
      if (!task || task.id === lastTaskId) return
      lastTaskId = task.id
      const payloadResponse = await chrome.runtime.sendMessage({ type: 'GET_PUBLISH_PAYLOAD' })
      if (!payloadResponse?.ok) throw new Error(payloadResponse?.error || '读取 md-wechat 文章失败')
      if (task.expectedTitle && task.expectedTitle !== payloadResponse.result.title) {
        throw new Error(`标题不匹配：任务要求「${task.expectedTitle}」，当前是「${payloadResponse.result.title}」`)
      }
      const result = await fill({ type: 'FILL_PLATFORM', payload: payloadResponse.result })
      await chrome.runtime.sendMessage({
        type: 'FINISH_PUBLISH_TASK',
        taskId: task.id,
        result: { ...result, saved: Boolean(result.ok && result.result?.saved), completedAt: new Date().toISOString() },
      })
    } catch (error) {
      await chrome.runtime.sendMessage({
        type: 'FINISH_PUBLISH_TASK',
        taskId: lastTaskId,
        result: { ok: false, error: error.message || String(error), completedAt: new Date().toISOString() },
      }).catch(() => {})
    } finally {
      polling = false
    }
  }

  async function fill(message) {
    const current = adapter()
    if (!current) return { ok: false, error: '当前页面不是支持的平台编辑页' }
    try {
      const result = await current.fill(message.payload)
      return { ok: true, platform: current.name, result }
    } catch (error) {
      return { ok: false, error: error.message || String(error) }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'FILL_PLATFORM') return false
    // 只让顶层页面执行一次；公众号的 UEditor iframe 由同源父页直接访问。
    if (window.top !== window) return false
    fill(message).then(sendResponse)
    return true
  })

  window.setInterval(pollPublishTask, 1500)
  window.setTimeout(pollPublishTask, 800)
})()

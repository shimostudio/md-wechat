const status = document.querySelector('#status')
const button = document.querySelector('#publish')

function show(message) {
  status.textContent = message
}

button.addEventListener('click', async () => {
  button.disabled = true
  show('正在读取 md-wechat 当前文章…')
  try {
    const payloadResponse = await chrome.runtime.sendMessage({ type: 'GET_PUBLISH_PAYLOAD' })
    if (!payloadResponse?.ok) throw new Error(payloadResponse?.error || '读取文章失败')
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('找不到当前页面')
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_PLATFORM', payload: payloadResponse.result })
    if (!result?.ok) throw new Error(result?.error || '当前页面不支持自动粘贴')
    const flags = result.result || {}
    show(`${result.platform}：标题${flags.title ? '已填' : '未找到'}，正文${flags.body ? '已粘贴' : '未找到'}，保存${flags.saved ? '已点击' : '请手动确认'}`)
  } catch (error) {
    const message = error.message || String(error)
    const hint = message.includes('图片缓存已过期')
      ? '请先刷新 md-wechat 排版页，确认文章图片显示后，再刷新目标平台编辑页重试。'
      : '如果页面刚打开，请刷新目标编辑页后重试。'
    show(`未完成：${message}\n\n${hint}`)
  } finally {
    button.disabled = false
  }
})

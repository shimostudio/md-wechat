(function () {
  function roots() {
    const result = [document]
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        if (iframe.contentDocument) result.push(iframe.contentDocument)
      } catch {
        // 跨域 iframe 由其自身的 content script 处理，主页面跳过。
      }
    }
    return result
  }

  function editorFrames() {
    return [...document.querySelectorAll('iframe')].filter((iframe) => {
      const className = String(iframe.className || '')
      const id = String(iframe.id || '')
      if (/ueditor|editor|edui/i.test(`${id} ${className}`)) return true
      try {
        const body = iframe.contentDocument?.body
        return Boolean(body && (body.isContentEditable || iframe.contentDocument.designMode === 'on'))
      } catch {
        return false
      }
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return br.width * br.height - ar.width * ar.height
    })
  }

  const matches = (selectors) => roots().flatMap((root) => selectors.flatMap((selector) => [...root.querySelectorAll(selector)]))

  function visible(element) {
    if (!element) return false
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }

  function largestVisible(selectors) {
    return matches(selectors)
      .filter(visible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return br.width * br.height - ar.width * ar.height
      })[0]
  }

  function setNativeValue(element, value) {
    if (element.isContentEditable) {
      element.textContent = value
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function dispatchPaste(element, html, text) {
    element.focus()
    const data = new DataTransfer()
    data.setData('text/html', html)
    data.setData('text/plain', text)
    const imageSources = [...html.matchAll(/<img[^>]+src=["'](data:image\/[^"']+)["']/gi)]
    for (let index = 0; index < imageSources.length; index += 1) {
      try {
        const response = await fetch(imageSources[index][1])
        const blob = await response.blob()
        const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
        data.items.add(new File([blob], `shimo-image-${index + 1}.${extension}`, { type: blob.type }))
      } catch {
        // data:image 仍保留在 text/html 中；平台若不接收文件项，至少还能保留正文。
      }
    }
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
    element.dispatchEvent(event)
    return !event.defaultPrevented
  }

  async function insertHtml(element, html, text) {
    element.focus()
    if (await dispatchPaste(element, html, text)) {
      try {
        const ownerDocument = element.ownerDocument || document
        const selection = ownerDocument.defaultView?.getSelection()
        const range = ownerDocument.createRange()
        range.selectNodeContents(element)
        selection.removeAllRanges()
        selection.addRange(range)
        ownerDocument.execCommand('insertHTML', false, html)
      } catch {
        element.innerHTML = html
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))
      }
    }
  }

  const common = {
    fillTitle(title, selectors) {
      const input = matches(selectors).find(visible) || [...document.querySelectorAll('[contenteditable="true"]')]
        .filter((item) => visible(item) && !item.closest('iframe') && !item.closest('.edui-body-container'))
        .filter((item) => {
          const rect = item.getBoundingClientRect()
          return rect.width >= 260 && rect.height <= 180
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
      if (!input) return false
      setNativeValue(input, title)
      return true
    },
    async fillBody(payload, selectors) {
      const editor = matches(selectors).find(visible)
      if (!editor) return false
      await insertHtml(editor, payload.html, payload.text)
      return true
    },
    async fillWechatBody(payload, selectors) {
      const iframe = editorFrames().find((item) => {
        try {
          return visible(item) && item.contentDocument?.body
        } catch {
          return false
        }
      })
      if (iframe) {
        const editorBody = iframe.contentDocument.body
        editorBody.innerHTML = ''
        await insertHtml(editorBody, payload.html, payload.text)
        return true
      }
      const editor = largestVisible(selectors)
      if (!editor) return false
      await insertHtml(editor, payload.html, payload.text)
      return true
    },
    clickSave(labels) {
      const buttons = [...document.querySelectorAll('button, [role="button"], a')].filter(visible)
      const button = buttons.find((item) => labels.some((label) => item.textContent?.trim() === label))
      button?.click()
      return Boolean(button)
    },
    isEditor(selectors) {
      return Boolean(largestVisible(selectors)) || editorFrames().length > 0
    },
  }

  window.SHiMOPlatformAdapters = {
    wechat: {
      name: '微信公众号',
      key: 'wechat',
      matches: () => location.hostname === 'mp.weixin.qq.com',
      isEditor: () => common.isEditor(['.edui-body-container', '[contenteditable="true"]', 'input#title', 'input.js_title']),
      async fill(payload) {
        // 微信正文通常位于 UEditor iframe。先找到正文，再填写标题，避免标题输入框抢焦点。
        const body = await common.fillWechatBody(payload, ['.edui-body-container', '[contenteditable="true"]', '[role="textbox"]'])
        const title = body && common.fillTitle(payload.title, ['input#title', 'input.js_title', 'input[id*="title"]', 'input[placeholder="请输入标题"]', 'input[placeholder*="标题"]'])
        return { title, body, saved: common.clickSave(['保存草稿', '保存为草稿', '保存']) }
      },
    },
    douyin: {
      name: '抖音',
      key: 'douyin',
      matches: () => location.hostname === 'creator.douyin.com' || location.hostname === 'www.douyin.com',
      isEditor: () => common.isEditor(['[contenteditable="true"]', 'textarea[placeholder*="正文"]', 'textarea[placeholder*="描述"]']),
      async fill(payload) {
        const body = await common.fillBody(payload, ['[contenteditable="true"]', 'textarea[placeholder*="正文"]', 'textarea[placeholder*="描述"]'])
        const title = body && common.fillTitle(payload.title, ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]'])
        return { title, body, saved: common.clickSave(['保存草稿', '保存为草稿', '保存']) }
      },
    },
    xiaohongshu: {
      name: '小红书',
      key: 'xiaohongshu',
      matches: () => location.hostname === 'creator.xiaohongshu.com' || location.hostname === 'www.xiaohongshu.com',
      isEditor: () => common.isEditor(['[contenteditable="true"]', 'textarea[placeholder*="正文"]', 'textarea[placeholder*="描述"]']),
      async fill(payload) {
        const body = await common.fillBody(payload, ['[contenteditable="true"]', 'textarea[placeholder*="正文"]', 'textarea[placeholder*="描述"]'])
        const title = body && common.fillTitle(payload.title, ['input[placeholder*="标题"]', 'input[aria-label*="标题"]'])
        return { title, body, saved: common.clickSave(['保存草稿', '保存为草稿', '保存']) }
      },
    },
  }
})()

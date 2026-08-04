import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import hljs from 'highlight.js/lib/common'
import { buildStyles } from './themes.js'

// highlight.js 类名 -> 内联样式，深浅两套配色（公众号会剥离 <style>，高亮必须内联）。
const HLJS_DARK = {
  'hljs-comment': 'color:#7f848e;font-style:italic',
  'hljs-quote': 'color:#7f848e;font-style:italic',
  'hljs-keyword': 'color:#c678dd',
  'hljs-selector-tag': 'color:#c678dd',
  'hljs-built_in': 'color:#e6c07b',
  'hljs-name': 'color:#e06c75',
  'hljs-tag': 'color:#e06c75',
  'hljs-attr': 'color:#d19a66',
  'hljs-attribute': 'color:#d19a66',
  'hljs-variable': 'color:#e06c75',
  'hljs-template-variable': 'color:#e06c75',
  'hljs-type': 'color:#e6c07b',
  'hljs-string': 'color:#98c379',
  'hljs-regexp': 'color:#98c379',
  'hljs-symbol': 'color:#56b6c2',
  'hljs-number': 'color:#d19a66',
  'hljs-literal': 'color:#56b6c2',
  'hljs-title': 'color:#61afef',
  'hljs-title.function_': 'color:#61afef',
  'hljs-title.class_': 'color:#e6c07b',
  'hljs-section': 'color:#61afef',
  'hljs-meta': 'color:#61afef',
  'hljs-link': 'color:#56b6c2',
  'hljs-emphasis': 'font-style:italic',
  'hljs-strong': 'font-weight:bold',
}

const HLJS_LIGHT = {
  'hljs-comment': 'color:#6a737d;font-style:italic',
  'hljs-quote': 'color:#6a737d;font-style:italic',
  'hljs-keyword': 'color:#d73a49',
  'hljs-selector-tag': 'color:#d73a49',
  'hljs-built_in': 'color:#e36209',
  'hljs-name': 'color:#22863a',
  'hljs-tag': 'color:#22863a',
  'hljs-attr': 'color:#6f42c1',
  'hljs-attribute': 'color:#6f42c1',
  'hljs-variable': 'color:#e36209',
  'hljs-template-variable': 'color:#e36209',
  'hljs-type': 'color:#d73a49',
  'hljs-string': 'color:#032f62',
  'hljs-regexp': 'color:#032f62',
  'hljs-symbol': 'color:#005cc5',
  'hljs-number': 'color:#005cc5',
  'hljs-literal': 'color:#005cc5',
  'hljs-title': 'color:#6f42c1',
  'hljs-title.function_': 'color:#6f42c1',
  'hljs-title.class_': 'color:#22863a',
  'hljs-section': 'color:#005cc5',
  'hljs-meta': 'color:#005cc5',
  'hljs-link': 'color:#032f62',
  'hljs-emphasis': 'font-style:italic',
  'hljs-strong': 'font-weight:bold',
}

// 代码块外观：深色窗口 / 浅色纸面
const CODE_CHROME = {
  dark: { hl: HLJS_DARK, bg: '#282c34', border: '', text: '#abb2bf', label: '#7f848e' },
  light: { hl: HLJS_LIGHT, bg: '#f6f8fa', border: 'border:1px solid #e1e4e8;', text: '#24292f', label: '#8b949e' },
}

function inlineHljsStyles(html, palette) {
  return html.replace(/class="([^"]+)"/g, (match, cls) => {
    const style = cls
      .trim()
      .split(/\s+/)
      .map((c) => palette[c])
      .filter(Boolean)
      .join(';')
    return style ? `style="${style}"` : ''
  })
}

// 每个「主题 + 设置」组合缓存一个渲染器实例，避免每次击键都重建。
// 渲染设置可能在拖动颜色、字号时快速产生大量组合，因此只保留最近使用的 12 个。
const CACHE_LIMIT = 12
const cache = new Map()

const normalizeGalleryMode = (mode) =>
  mode === 'grid' || mode === 'stack' || mode === 'collage' ? mode : 'collage'

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// local: 图片引用解析（IndexedDB 图片库的 objectURL），由应用启动时注册。
// 未注册或解析失败时回退为空 src，渲染表现为占位而非破图链接。
let imageResolver = null
export function setImageResolver(fn) {
  imageResolver = typeof fn === 'function' ? fn : null
}
function resolveImageSrc(src) {
  if (!src.startsWith('local:')) return src
  if (!imageResolver) return ''
  return imageResolver(src) || ''
}

function createMd(theme, opts) {
  const styles = buildStyles(theme, opts)
  const chrome = CODE_CHROME[theme.codeTheme] || CODE_CHROME.dark
  const macCode = !!opts.macCode
  const sticker = opts.sticker ? String(opts.sticker).trim() : ''
  const galleryMode = normalizeGalleryMode(opts.galleryMode)
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  md.use(markdownItMark) // ==高亮标记==
  const esc = md.utils.escapeHtml

  // 同步滚动定位：给块级元素打上源码行号（预览用，复制时会剥离）
  const dl = (token) => (token && token.map ? ` data-line="${token.map[0]}"` : '')
  const defaultRenderToken = md.renderer.renderToken.bind(md.renderer)
  md.renderer.renderToken = (tokens, idx, options) => {
    const t = tokens[idx]
    if (t.map && t.nesting === 1 && !t.attrGet('data-line')) t.attrSet('data-line', String(t.map[0]))
    return defaultRenderToken(tokens, idx, options)
  }

  // ---- 图库排版：连续图片自动拼成并排 / 网格布局 ----
  // 模式 A：空行分隔的连续单图段落；模式 B：同一段落内软换行分隔的多图
  md.core.ruler.push('gallery', (state) => {
    const t = state.tokens
    const isSingleImgPara = (i) =>
      t[i]?.type === 'paragraph_open' &&
      t[i + 1]?.type === 'inline' &&
      t[i + 1].children?.length === 1 &&
      t[i + 1].children[0].type === 'image' &&
      t[i + 2]?.type === 'paragraph_close'
    const galleryInlineCount = (i) => {
      if (t[i]?.type !== 'paragraph_open' || t[i + 1]?.type !== 'inline' || t[i + 2]?.type !== 'paragraph_close') return 0
      const c = t[i + 1].children || []
      const imgs = c.filter((x) => x.type === 'image')
      return imgs.length >= 2 && c.every((x) => x.type === 'image' || x.type === 'softbreak') ? imgs.length : 0
    }

    for (let i = 0; i < t.length; i++) {
      if (isSingleImgPara(i)) {
        let count = 0
        while (isSingleImgPara(i + count * 3)) count++
        if (count < 2) continue
        for (let k = 0; k < count; k++) {
          const base = i + k * 3
          t[base].attrSet('data-g', `${count}:${k}`)
          t[base + 2].attrSet('data-gc', `${count}:${k}`)
          t[base + 1].children[0].attrSet('data-gi', `plain:${count}:${k}`)
        }
        i += count * 3 - 1
      } else {
        const count = galleryInlineCount(i)
        if (!count) continue
        t[i].attrSet('data-g', `${count}:wrap`)
        t[i + 2].attrSet('data-gc', 'wrap')
        let k = 0
        for (const x of t[i + 1].children) {
          if (x.type === 'image') x.attrSet('data-gi', `${count}:${k++}`)
          else if (x.type === 'softbreak') x.attrSet('data-gskip', '1')
        }
      }
    }
  })

  // ---- 视频占位：公众号不支持粘贴视频，检测视频写法并渲染占位卡片 ----
  // 识别三种独占一段的写法：<video> 标签、已知视频平台的 <iframe>、视频文件直链。
  // 占位卡随主题主色，复制到公众号后按提示在后台「插入 → 视频」替换。
  const VIDEO_HOSTS = /v\.qq\.com|player\.bilibili\.com|youtube\.com|youtu\.be|ixigua\.com|youku\.com/i
  const VIDEO_FILE = /^https?:\/\/\S+?\.(?:mp4|mov|m4v|webm|m3u8)(?:\?\S*)?$/i
  const detectVideo = (text) => {
    const s = text.trim()
    if (/^<video[\s>][\s\S]*$/i.test(s)) return s.match(/src=["']([^"']+)["']/i)?.[1] ?? ''
    if (/^<iframe[\s>][\s\S]*$/i.test(s) && VIDEO_HOSTS.test(s)) {
      return s.match(/src=["']([^"']+)["']/i)?.[1] ?? ''
    }
    if (VIDEO_FILE.test(s)) return s
    return null
  }
  const videoPlaceholder = (url, map) => {
    const line = map ? ` data-line="${map[0]}"` : ''
    const urlLine = url
      ? `<p style="margin:0.4em 0 0;font-size:0.78em;opacity:0.55;word-break:break-all;">${esc(url)}</p>`
      : ''
    return `<section${line} style="${escapeHtmlAttr(
      styles.video
    )}"><p style="margin:0;font-size:1.35em;line-height:1.3;">▶</p><p style="margin:0.3em 0 0;font-weight:700;">视频占位</p>${urlLine}<p style="margin:0.4em 0 0;font-size:0.78em;opacity:0.55;">粘贴后请在公众号后台「插入 → 视频」替换此处</p></section>`
  }
  md.core.ruler.push('video_placeholder', (state) => {
    const t = state.tokens
    for (let i = 0; i < t.length; i++) {
      if (t[i]?.type !== 'paragraph_open' || t[i + 1]?.type !== 'inline' || t[i + 2]?.type !== 'paragraph_close') continue
      const url = detectVideo(t[i + 1].content)
      if (url === null) continue
      const tok = new state.Token('html_block', '', 0)
      tok.map = t[i].map
      tok.content = videoPlaceholder(url, t[i].map)
      t.splice(i, 3, tok)
    }
  })
  // 需要“索引式章节号”的主题可以把 H2 开头的数字独立成视觉组件。
  // 只处理主题主动开启的纯文本前缀，不改变其他主题和无编号标题。
  if (theme.extractH2Index) {
    md.core.ruler.push('section_index', (state) => {
      for (let i = 0; i < state.tokens.length - 1; i++) {
        const open = state.tokens[i]
        const inline = state.tokens[i + 1]
        if (open.type !== 'heading_open' || open.tag !== 'h2' || inline?.type !== 'inline') continue

        const firstText = inline.children?.find((child) => child.type === 'text' && child.content.trim())
        if (!firstText) continue
        const match = firstText.content.match(/^(\d{1,2})[.、]?\s+(.+)$/)
        if (!match) continue

        open.meta = { ...(open.meta || {}), sectionIndex: match[1].padStart(2, '0') }
        firstText.content = match[2]
      }
    })
  }

  // 为段落记录真实的块级祖先。不能靠“向前找到最近的 open token”猜测，
  // 因为子列表 / 子引用关闭后，段落仍可能属于外层列表项或引用。
  md.core.ruler.push('block_context', (state) => {
    const stack = []

    for (const token of state.tokens) {
      if (token.nesting === -1) stack.pop()

      if (token.type === 'paragraph_open') {
        const nearest = [...stack]
          .reverse()
          .find((type) => type === 'list_item_open' || type === 'blockquote_open')
        token.meta = {
          ...(token.meta || {}),
          blockContext:
            nearest === 'list_item_open'
              ? 'list'
              : nearest === 'blockquote_open'
                ? 'blockquote'
                : 'normal',
        }
      }

      if (token.type === 'blockquote_open') {
        token.meta = {
          ...(token.meta || {}),
          blockquoteDepth: stack.filter((type) => type === 'blockquote_open').length,
        }
      }

      if (token.nesting === 1) stack.push(token.type)
    }
  })

  const galleryContainer = (token, count) => {
    let layout = 'display:block;'
    if (galleryMode === 'grid') layout = 'display:flex;flex-wrap:wrap;justify-content:space-between;'
    if (galleryMode === 'collage' && (count === 2 || count === 3)) layout = 'display:flex;'
    return `<section${dl(token)} data-gallery-mode="${galleryMode}" style="${escapeHtmlAttr(`${layout}${styles.gallery}`)}">`
  }

  // 每个布局都只使用 section + inline flex，不依赖 grid、定位或外部 CSS。
  // collage 的嵌套开合由序号决定，因此既支持空行分隔的图片，也支持同段软换行图片。
  const galleryItemParts = (count, i) => {
    if (galleryMode === 'stack') {
      return {
        open: `<section style="margin:0 0 ${i === count - 1 ? '0' : '8px'};overflow:hidden;">`,
        close: '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    if (galleryMode === 'grid') {
      const width = count === 2 ? '49%' : count === 3 ? '32%' : count === 4 ? '49%' : '32%'
      const height = count === 2 ? 190 : count === 3 ? 150 : 156
      return {
        open: `<section style="width:${width};height:${height}px;margin-bottom:6px;overflow:hidden;">`,
        close: '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }

    if (count === 2) {
      return {
        open:
          i === 0
            ? '<section style="width:61%;height:220px;margin-right:6px;overflow:hidden;">'
            : '<section style="flex:1;height:220px;overflow:hidden;">',
        close: '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }

    if (count === 3) {
      if (i === 0) {
        return {
          open: '<section style="width:62%;height:230px;margin-right:6px;overflow:hidden;">',
          close: '</section>',
          image: 'height:100%;object-fit:cover;box-sizing:border-box;',
        }
      }
      return {
        open:
          i === 1
            ? '<section style="flex:1;display:flex;flex-direction:column;"><section style="height:112px;margin-bottom:6px;overflow:hidden;">'
            : '<section style="height:112px;overflow:hidden;">',
        close: i === 2 ? '</section></section>' : '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }

    if (count === 4) {
      if (i === 0) {
        return {
          open: '<section style="height:190px;margin-bottom:6px;overflow:hidden;">',
          close: '</section>',
          image: 'height:100%;object-fit:cover;box-sizing:border-box;',
        }
      }
      return {
        open:
          i === 1
            ? '<section style="display:flex;justify-content:space-between;"><section style="width:32%;height:116px;overflow:hidden;">'
            : '<section style="width:32%;height:116px;overflow:hidden;">',
        close: i === 3 ? '</section></section>' : '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }

    // 5+：上方是一主两次的编辑式焦点区，下方根据余图数量组成双列或三列。
    if (i === 0) {
      return {
        open:
          '<section style="display:flex;margin-bottom:6px;"><section style="width:62%;height:224px;margin-right:6px;overflow:hidden;">',
        close: '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }
    if (i === 1 || i === 2) {
      return {
        open:
          i === 1
            ? '<section style="flex:1;display:flex;flex-direction:column;"><section style="height:109px;margin-bottom:6px;overflow:hidden;">'
            : '<section style="height:109px;overflow:hidden;">',
        close: i === 2 ? '</section></section></section>' : '</section>',
        image: 'height:100%;object-fit:cover;box-sizing:border-box;',
      }
    }

    const remaining = count - 3
    const width = remaining === 3 ? '32%' : '49%'
    return {
      open:
        i === 3
          ? `<section style="display:flex;flex-wrap:wrap;justify-content:space-between;"><section style="width:${width};height:132px;margin-bottom:6px;overflow:hidden;">`
          : `<section style="width:${width};height:132px;margin-bottom:6px;overflow:hidden;">`,
      close: i === count - 1 ? '</section></section>' : '</section>',
      image: 'height:100%;object-fit:cover;box-sizing:border-box;',
    }
  }

  const codeStyle =
    `font-family:Menlo,Consolas,'Courier New',monospace;font-size:13px;line-height:1.7;` +
    `color:${chrome.text};white-space:pre;${styles.preCode || ''}`

  // Mac 风格代码窗口：三个信号灯 + 语言标签
  const wrapCode = (inner, lang, token) => {
    const frameStyle =
      styles.pre ||
      `background-color:${chrome.bg};${chrome.border}border-radius:10px;margin:1.2em 8px;overflow:hidden;`
    const plainStyle = styles.prePlain || 'padding:16px;overflow-x:auto;'
    const bodyStyle =
      styles.preBody || 'background-color:transparent;padding:12px 16px 16px;margin:0;overflow-x:auto;'
    const headerStyle = styles.preHeader || 'padding:12px 16px 0;font-size:0;line-height:0;'
    const labelStyle =
      styles.preLabel ||
      `color:${chrome.label};font-size:12px;line-height:11px;margin-left:10px;vertical-align:top;`

    if (!macCode || theme.codeChrome === 'plain') {
      return `<pre${dl(token)} style="${escapeHtmlAttr(`${frameStyle}${plainStyle}`)}"><code style="${escapeHtmlAttr(codeStyle)}">${inner}</code></pre>`
    }

    if (theme.codeChrome === 'label') {
      const prefix = theme.codeLabel ? esc(theme.codeLabel) : 'CODE'
      const labelText = lang ? `${prefix} / ${esc(lang.toUpperCase())}` : prefix
      return (
        `<section${dl(token)} style="${escapeHtmlAttr(frameStyle)}">` +
        `<section style="${escapeHtmlAttr(headerStyle)}"><span style="${escapeHtmlAttr(labelStyle)}">${labelText}</span></section>` +
        `<pre style="${escapeHtmlAttr(bodyStyle)}"><code style="${escapeHtmlAttr(codeStyle)}">${inner}</code></pre>` +
        `</section>`
      )
    }

    const dots =
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#ff5f56;margin-right:7px;"></span>` +
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#ffbd2e;margin-right:7px;"></span>` +
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#27c93f;"></span>`
    const label = lang
      ? `<span style="${escapeHtmlAttr(labelStyle)}">${esc(lang)}</span>`
      : ''
    return (
      `<section${dl(token)} style="${escapeHtmlAttr(frameStyle)}">` +
      `<section style="${escapeHtmlAttr(headerStyle)}">${dots}${label}</section>` +
      `<pre style="${escapeHtmlAttr(bodyStyle)}"><code style="${escapeHtmlAttr(codeStyle)}">${inner}</code></pre>` +
      `</section>`
    )
  }

  md.renderer.rules.paragraph_open = (tokens, idx) => {
    // Markdown-it 会把紧凑列表中的段落标记为 hidden；尊重该语义，避免
    // 把 <li>项目</li> 改写成带额外边距的 <li><p>项目</p></li>。
    if (tokens[idx].hidden) return ''

    // 图库分支
    const g = tokens[idx].attrGet('data-g')
    if (g) {
      const [countStr, pos] = g.split(':')
      const count = Number(countStr)
      if (pos === 'wrap') return galleryContainer(tokens[idx], count)
      const i = Number(pos)
      return `${i === 0 ? galleryContainer(tokens[idx], count) : ''}${galleryItemParts(count, i).open}`
    }
    // 引用块 / 宽松列表项里的段落使用各自样式，避免普通正文的首行缩进、
    // 对齐和横向边距污染嵌套结构。
    const context = tokens[idx].meta?.blockContext
    if (context === 'list') return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.liP)}">`
    if (context === 'blockquote') return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.bqP)}">`
    return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.p)}">`
  }

  md.renderer.rules.paragraph_close = (tokens, idx) => {
    if (tokens[idx].hidden) return ''

    const g = tokens[idx].attrGet('data-gc')
    if (g) {
      if (g === 'wrap') return `</section>`
      const [countStr, pos] = g.split(':')
      const count = Number(countStr)
      const i = Number(pos)
      return `${galleryItemParts(count, i).close}${i === count - 1 ? '</section>' : ''}`
    }
    return `</p>\n`
  }

  md.renderer.rules.softbreak = (tokens, idx) => (tokens[idx].attrGet('data-gskip') ? '' : '<br>')

  md.renderer.rules.heading_open = (tokens, idx) => {
    const level = Number(tokens[idx].tag.slice(1))
    const style =
      { 1: styles.h1, 2: styles.h2, 3: styles.h3, 4: styles.h4, 5: styles.h5, 6: styles.h6 }[
        level
      ] || styles.h4
    const wrap = styles[`h${level}WrapOpen`] || ''
    const sectionIndex =
      level === 2 && tokens[idx].meta?.sectionIndex && styles.h2Index
        ? `<span aria-hidden="true" style="${escapeHtmlAttr(styles.h2Index)}">${esc(tokens[idx].meta.sectionIndex)}</span>`
        : ''
    return `<h${level}${dl(tokens[idx])} style="${escapeHtmlAttr(style)}">${sectionIndex}${wrap}`
  }
  md.renderer.rules.heading_close = (tokens, idx) => {
    const level = Number(tokens[idx].tag.slice(1))
    const wrap = styles[`h${level}WrapClose`] || ''
    // 标题贴纸：跟在二级标题后面的小图（小玩偶）
    const deco =
      level === 2 && sticker
        ? `<img src="${esc(sticker)}" alt="" style="height:1.2em;width:auto;vertical-align:-0.2em;margin-left:0.4em;"/>`
        : ''
    return `${wrap}${deco}</h${level}>`
  }

  md.renderer.rules.blockquote_open = (tokens, idx) => {
    const style =
      tokens[idx].meta?.blockquoteDepth > 0 ? styles.blockquoteNested : styles.blockquote
    return `<blockquote${dl(tokens[idx])} style="${escapeHtmlAttr(style)}">`
  }
  md.renderer.rules.bullet_list_open = (tokens, idx) =>
    `<ul${dl(tokens[idx])} style="${escapeHtmlAttr(styles.ul)}">`
  md.renderer.rules.ordered_list_open = (tokens, idx) => {
    const start = tokens[idx].attrGet('start')
    const startAttr = start ? ` start="${escapeHtmlAttr(start)}"` : ''
    return `<ol${dl(tokens[idx])}${startAttr} style="${escapeHtmlAttr(styles.ol)}">`
  }
  md.renderer.rules.list_item_open = () => `<li style="${escapeHtmlAttr(styles.li)}">`
  md.renderer.rules.strong_open = () => `<strong style="${escapeHtmlAttr(styles.strong)}">`
  md.renderer.rules.mark_open = () => `<mark style="${escapeHtmlAttr(styles.mark)}">`
  if (styles.em) md.renderer.rules.em_open = () => `<em style="${escapeHtmlAttr(styles.em)}">`
  if (styles.s) md.renderer.rules.s_open = () => `<s style="${escapeHtmlAttr(styles.s)}">`
  md.renderer.rules.hr = (tokens, idx) => {
    if (styles.hrHtml) return styles.hrHtml.replace('>', `${dl(tokens[idx])}>`)
    return `<hr${dl(tokens[idx])} style="${escapeHtmlAttr(styles.hr)}"/>`
  }

  md.renderer.rules.link_open = (tokens, idx) => {
    const title = tokens[idx].attrGet('title')
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : ''
    return `<a href="${esc(tokens[idx].attrGet('href') || '')}"${titleAttr} style="${escapeHtmlAttr(styles.a)}">`
  }

  // 图片：独立图 alt 转图注；图库中的图用平铺样式、不出图注
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]
    const src = resolveImageSrc(esc(token.attrGet('src') || ''))
    const alt = token.content || ''
    const title = token.attrGet('title')
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : ''
    const gi = token.attrGet('data-gi')
    if (gi?.startsWith('plain:')) {
      const [, countStr, pos] = gi.split(':')
      const parts = galleryItemParts(Number(countStr), Number(pos))
      return `<img${dl(token)} src="${src}" alt="${esc(alt)}"${titleAttr} style="${escapeHtmlAttr(`${styles.galleryImg}${parts.image}`)}"/>`
    }
    if (gi) {
      const [count, i] = gi.split(':').map(Number)
      const parts = galleryItemParts(count, i)
      return `${parts.open}<img src="${src}" alt="${esc(alt)}"${titleAttr} style="${escapeHtmlAttr(`${styles.galleryImg}${parts.image}`)}"/>${parts.close}`
    }
    const imgTag = `<img${dl(token)} src="${src}" alt="${esc(alt)}"${titleAttr} style="${escapeHtmlAttr(styles.img)}"/>`
    if (!alt.trim()) return imgTag
    return `${imgTag}<span style="${escapeHtmlAttr(styles.caption)}">${esc(alt)}</span>`
  }

  // 表格外层包一个横向滚动容器，宽表格在手机上可以滑动
  md.renderer.rules.table_open = (tokens, idx) =>
    `<section${dl(tokens[idx])} style="${escapeHtmlAttr(styles.tableWrap)}"><table style="${escapeHtmlAttr(styles.table)}">`
  md.renderer.rules.table_close = () => `</table></section>`
  md.renderer.rules.th_open = (tokens, idx) => {
    const align = tokens[idx].attrGet('style') || ''
    return `<th style="${escapeHtmlAttr(`${styles.th}${align}`)}">`
  }
  md.renderer.rules.td_open = (tokens, idx) => {
    const align = tokens[idx].attrGet('style') || ''
    return `<td style="${escapeHtmlAttr(`${styles.td}${align}`)}">`
  }

  md.renderer.rules.code_inline = (tokens, idx) =>
    `<code style="${escapeHtmlAttr(styles.code)}">${esc(tokens[idx].content)}</code>`

  md.renderer.rules.code_block = (tokens, idx) => wrapCode(esc(tokens[idx].content), '', tokens[idx])

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0]
    let inner
    try {
      inner =
        lang && hljs.getLanguage(lang)
          ? inlineHljsStyles(hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value, chrome.hl)
          : esc(token.content)
    } catch {
      inner = esc(token.content)
    }
    return wrapCode(inner, lang, token)
  }

  return { md, styles }
}

export function renderMarkdown(src, theme, opts = {}) {
  const key = [
    theme.id,
    opts.accent || '',
    JSON.stringify(opts.slotColors || {}),
    opts.fontSize || '',
    opts.fontFamily || '',
    opts.macCode ? 1 : 0,
    opts.sticker || '',
    normalizeGalleryMode(opts.galleryMode),
    JSON.stringify(opts.custom || {}),
  ].join('|')
  let entry = cache.get(key)
  if (entry) {
    // Map 的插入顺序就是 LRU 顺序；命中后移到队尾。
    cache.delete(key)
    cache.set(key, entry)
  } else {
    entry = createMd(theme, opts)
    cache.set(key, entry)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
  }
  return `<section style="${escapeHtmlAttr(entry.styles.container)}">${entry.md.render(src)}</section>`
}

// 复制前剥离预览专用标记
export function stripPreviewMeta(html) {
  return html.replace(/ data-line="\d+"/g, '')
}

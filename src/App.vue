<template>
  <div v-if="publicMode" class="public-app">
    <header class="public-header">
      <div class="public-brand">
        <span class="public-mark">字</span>
        <div>
          <strong>字间排版</strong>
          <span>手机复制工作台</span>
        </div>
      </div>
      <button class="public-copy" type="button" :disabled="publicLoading" @click="doCopy">
        {{ publicLoading ? '正在加载…' : '复制富文本' }}
      </button>
    </header>

    <div v-if="publicLoading" class="public-state">正在加载文章排版…</div>
    <div v-else-if="publicError" class="public-state public-error">{{ publicError }}</div>
    <main v-else class="public-main">
      <img v-if="publicCoverUrl" class="public-cover" :src="publicCoverUrl" alt="文章主封面" />
      <div class="public-meta">
        <h1>{{ documentTitle }}</h1>
        <p>点击右上角复制富文本，再粘贴到公众号助手。</p>
      </div>
      <div class="wechat-chrome public-wechat">
        <div class="wc-title">{{ documentTitle }}</div>
        <div class="wc-meta">
          <span class="wc-account">字间排版</span>
          <span class="wc-author">作者</span>
          <time>{{ todayText }}</time>
        </div>
        <div ref="previewViewport" class="page" :style="{ backgroundColor: renderTheme.surface || '#ffffff' }" v-html="html"></div>
      </div>
    </main>

    <div v-if="store.toast" class="public-toast" role="status" aria-live="polite">{{ store.toast }}</div>
  </div>

  <div v-else class="app-d">
    <TopBar />

    <div class="d-body">
      <RailBar />
      <div class="left-panels" aria-label="左侧工作面板">
        <SideBar />
        <ThemePanel />
      </div>

      <main ref="mainRef" class="canvas" :class="`mode-${viewMode}`">
        <div class="editor-pane" :class="{ 'pane-hidden': viewMode === 'preview' }" :style="editorStyle">
          <Toolbar @cmd="onCmd" />
          <div class="editor-body">
            <Editor ref="editorRef" v-model="store.md" @scrollline="onEditorScroll" />
          </div>
          <div class="statusbar">
            <span>{{ charCount }} 字</span>
            <span>阅读约 {{ readMinutes }} 分钟</span>
            <span class="spacer"></span>
            <span>{{ theme.name }} · {{ store.settings.fontSize }}px</span>
          </div>
        </div>

        <div
          class="divider"
          :class="{ 'pane-hidden': viewMode === 'preview' }"
          role="separator"
          aria-label="调整编辑区和预览区宽度"
          aria-orientation="vertical"
          :aria-valuenow="store.settings.editorPct"
          aria-valuemin="25"
          aria-valuemax="70"
          tabindex="0"
          title="拖拽或使用左右方向键调整宽度"
          @pointerdown="startDrag"
          @keydown.left.prevent="resizeBy(-2)"
          @keydown.right.prevent="resizeBy(2)"
        >
          <span></span>
        </div>

        <div
          class="preview-pane"
          :class="[{ 'is-preview-only': viewMode === 'preview' }, `dev-${activePreviewMode.value}`]"
        >
          <PreviewBar
            :view-mode="viewMode"
            :can-restore="!!store.backupMd"
            @change-view="setViewMode"
            @change-device="switchDevice"
            @copy="doCopy"
            @copy-source="copySource"
            @restore="restoreLastDocument"
            @reset="resetDoc"
            @load-sample="loadSample"
            @import="importMd"
            @export="exportMd"
          />
          <div class="preview-scroll" :class="`is-${activePreviewMode.value}`">
            <div
              ref="previewStage"
              class="preview-stage"
              :class="{ 'theme-fading': themeFading, 'device-switching': deviceSwitching }"
            >
              <div
                class="preview-frame-wrap"
                :data-preview-device="activePreviewMode.value"
                :style="previewWrapStyle"
              >
                <div
                  class="preview-frame"
                  :data-preview-device="activePreviewMode.value"
                  :style="previewFrameStyle"
                >
                  <img
                    v-if="activePreviewMode.frame"
                    class="device-frame-media"
                    :class="`is-${activePreviewMode.value}`"
                    :src="activePreviewMode.frame"
                    alt=""
                    aria-hidden="true"
                  />
                  <div class="device-screen" :style="previewScreenStyle">
                    <div class="wechat-chrome" :data-device="activePreviewMode.value">
                      <div class="wc-title">{{ documentTitle }}</div>
                      <div class="wc-meta">
                        <span class="wc-account">字间排版</span>
                        <span class="wc-author">作者</span>
                        <time>{{ todayText }}</time>
                      </div>
                      <div
                        ref="previewViewport"
                        class="page"
                        :data-preview-device="activePreviewMode.value"
                        :style="{ backgroundColor: renderTheme.surface || '#ffffff' }"
                        title="点击任意段落，回到对照模式并定位到对应源码行"
                        @click="onPreviewClick"
                        v-html="html"
                      ></div>
                      <div class="wc-footer" aria-hidden="true">
                        <span>分享</span><span>收藏</span><span>在看</span><span>点赞</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SettingsPanel />
    </div>

    <Transition name="toast">
      <div v-if="store.toast" class="toast" role="status" aria-live="polite">
        {{ store.toast }}
      </div>
    </Transition>

    <input ref="fileInput" type="file" accept=".md,.markdown,.txt" hidden @change="onFile" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import TopBar from './components/TopBar.vue'
import RailBar from './components/RailBar.vue'
import SideBar from './components/SideBar.vue'
import ThemePanel from './components/ThemePanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import PreviewBar from './components/PreviewBar.vue'
import Toolbar from './components/Toolbar.vue'
import Editor from './components/Editor.vue'
import {
  store,
  theme,
  notify,
  docTitle,
  countChars,
  restoreDocument,
  createDocument,
  selectDocument,
  renameDocument,
  deleteDocument,
  restoreFromTrash,
  removeFromTrash,
  importContents,
  replaceDocument,
  clearBackup,
  usedImageIds,
  flushPendingWrites,
  registerImageAspect,
  getImageAspect,
  setActiveAccent,
  setSlotColor,
  setGalleryOverride,
  clearGalleryOverride,
} from './lib/store.js'
import { themes } from './lib/themes.js'
import { renderMarkdown, stripPreviewMeta, copyVideoPlaceholder } from './lib/renderer.js'
import { copyRichText, copyText } from './lib/clipboard.js'
import { getImage, putImage, cacheImage, blobToDataUrl, getCachedImageEntries, pruneImages } from './lib/imagedb.js'
import { sample, samples } from './lib/sample.js'
import { startAutomationBridge } from './lib/automation.js'

function htmlToPlainText(htmlText) {
  const element = document.createElement('div')
  element.innerHTML = htmlText
  return element.textContent || ''
}

function removeLeadingArticleTitle(htmlText) {
  return String(htmlText || '').replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')
}

const editorRef = ref(null)
const fileInput = ref(null)
const mainRef = ref(null)
const previewStage = ref(null)
const previewViewport = ref(null)
const previewScale = ref(1)
const publicSlug = new URLSearchParams(window.location.search).get('article') || ''
const publicMode = ref(Boolean(publicSlug))
const publicLoading = ref(Boolean(publicSlug))
const publicError = ref('')
const publicCoverUrl = ref('')
let stopAutomationBridge = () => {}

function publicAssetUrl(slug, assetPath) {
  const filename = String(assetPath || '').replace(/^.*?assets\//, '')
  const base = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(`articles/${encodeURIComponent(slug)}/assets/${encodeURIComponent(filename)}`, base).href
}

async function loadPublicArticle() {
  if (!publicMode.value) return
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.href)
    const articleUrl = new URL(`articles/${encodeURIComponent(publicSlug)}/article.json`, base)
    const response = await fetch(articleUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error('文章链接不存在或尚未部署')
    const article = await response.json()
    if (!article.markdown) throw new Error('在线文章内容为空')
    const markdown = String(article.markdown).replace(/assets\/([^\s)]+)/g, (_, filename) => publicAssetUrl(publicSlug, filename))
    replaceDocument(markdown)
    if (article.themeId && themes.some((item) => item.id === article.themeId)) store.themeId = article.themeId
    publicCoverUrl.value = article.cover ? publicAssetUrl(publicSlug, article.cover) : ''
    await nextTick()
    store.settings.viewMode = 'preview'
  } catch (error) {
    publicError.value = error?.message || String(error)
  } finally {
    publicLoading.value = false
  }
}

function openDocuments() {
  store.ui.documentView = 'documents'
  store.ui.drawerOpen = true
}

// 公众号文章页骨架：标题取文档首行标题，日期取当天
const todayText = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

// 正式主题 or 主题菜单悬停时的“试看”主题：悬停时文章实时换肤，不确认不生效
const renderTheme = computed(() => themes.find((t) => t.id === store.previewThemeId) || theme.value)

// 主题切换时的短促淡入过渡
const themeFading = ref(false)
watch(
  () => store.themeId,
  () => {
    themeFading.value = true
    window.setTimeout(() => (themeFading.value = false), 200)
  }
)

// 设备切换：交叉淡入淡出——先淡出，瞬间换设备，再淡入；不做几何变形动画
const deviceSwitching = ref(false)

function switchDevice(value) {
  if (value === store.settings.previewWidth || deviceSwitching.value) return
  deviceSwitching.value = true
  window.setTimeout(() => {
    store.settings.previewWidth = value
    window.setTimeout(() => (deviceSwitching.value = false), 170)
  }, 170)
}

const html = computed(() => {
  store.imageCacheVersion // 图片缓存预热完成后触发重渲染
  store.aspectVersion // 图片比例学习到新值后重渲染（对齐式画廊）
  return renderMarkdown(store.md, renderTheme.value, {
    ...store.settings,
    accent: store.settings.accentByTheme?.[renderTheme.value.id] || null,
    slotColors: store.settings.accentSlotsByTheme?.[renderTheme.value.id] || null,
    custom: (store.settings.custom || {})[renderTheme.value.id],
  })
})
const charCount = computed(() => countChars(store.md))
const readMinutes = computed(() => Math.max(1, Math.ceil(charCount.value / 400)))
const documentTitle = computed(() => docTitle(store.md))

const frameUrl = (file) => `${import.meta.env.BASE_URL}device-frames/${file}`

const previewModes = [
  {
    name: '满屏',
    label: '按当前工作区完整预览',
    value: 'full',
  },
  {
    name: '手机',
    label: '手机样机预览',
    value: 'mobile',
    width: 423,
    height: 882,
    frame: frameUrl('iphone-15-pro.svg'),
    screen: { x: 15, y: 15, width: 393, height: 852 },
  },
  {
    name: '桌面',
    label: '桌面显示器预览',
    value: 'desktop',
    width: 1200,
    height: 999,
    frame: frameUrl('imac-pro.png'),
    screen: { x: 68, y: 71, width: 1064, height: 601 },
  },
]
const activePreviewMode = computed(
  () => previewModes.find((mode) => mode.value === store.settings.previewWidth) || previewModes[0]
)
const previewWrapStyle = computed(() => {
  const mode = activePreviewMode.value
  if (!mode.width || !mode.height) return null
  return {
    width: `${mode.width * previewScale.value}px`,
    height: `${mode.height * previewScale.value}px`,
  }
})
const previewFrameStyle = computed(() => {
  const mode = activePreviewMode.value
  if (!mode.width || !mode.height) return null
  return {
    width: `${mode.width}px`,
    height: `${mode.height}px`,
    transform: `scale(${previewScale.value})`,
  }
})
const previewScreenStyle = computed(() => {
  const screen = activePreviewMode.value.screen
  if (!screen) return null
  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
    width: `${screen.width}px`,
    height: `${screen.height}px`,
  }
})

const viewMode = computed(() => {
  const mode = store.settings.viewMode || 'split'
  return ['split', 'preview'].includes(mode) ? mode : 'split'
})
const editorStyle = computed(() => ({ flex: `0 0 ${store.settings.editorPct}%` }))

function setViewMode(mode) {
  if (['split', 'preview'].includes(mode)) store.settings.viewMode = mode
}

// ---- 编辑/预览同步滚动（按源码行号对齐） ----

let blocks = []

function rebuildBlocks() {
  if (!previewViewport.value) return
  blocks = Array.from(previewViewport.value.querySelectorAll('[data-line]')).map((el) => ({
    line: Number(el.dataset.line),
    el,
  }))
  // 内容高度变化可能改变"谁是滚动容器"（不满一屏 ↔ 超一屏），滚动缓存作废
  resetSyncCache()
}

watch(html, () => nextTick(rebuildBlocks))

// 图片比例学习与画廊自动微调：输入停顿 120ms 后再跑，避免每次击键都
// 触发一轮 DOM 测量与异步等待（外链图未加载时要挂起等待）。
let mediaPassTimer = null
watch(html, () => {
  clearTimeout(mediaPassTimer)
  mediaPassTimer = window.setTimeout(runMediaPass, 120)
})
async function runMediaPass() {
  await collectImageAspects()
}
watch(viewMode, () =>
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
    resetSyncCache()
  })
)
watch(
  () => activePreviewMode.value.value,
  () =>
    nextTick(() => {
      measurePreviewFrame()
      rebuildBlocks()
      resetSyncCache()
    })
)

// 找到元素真正的滚动祖先（满屏是外层预览区，样机是设备屏幕）
function findScroller(el) {
  let node = el
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

// 同步滚动的缓存：滚动容器与它的视口位置在布局不变时是常量。
// 每帧都 findScroller/getComputedStyle/量容器 rect 会强制样式重算与布局，
// 滚动时 CodeMirror 正在增删虚拟行 DOM，代价尤其高——卡顿的主要来源。
let syncBox = null
let syncBoxTop = 0

function resetSyncCache() {
  syncBox = null
}

// 跟随滚动是主线程逐帧重绘，图片多时每帧成本可能超过 16ms。
// 同步滚动是"行级跳转"而非逐像素，隔帧同步（30fps）视觉无感，
// 预览每帧渲染预算翻倍，帧率感受显著提升。
let syncFrame = 0

function onEditorScroll(line) {
  syncFrame = (syncFrame + 1) % 2
  if (syncFrame) return
  if (!blocks.length) return
  if (!syncBox) {
    syncBox = findScroller(previewViewport.value)
    if (!syncBox) return
    syncBoxTop = syncBox.getBoundingClientRect().top
  }
  let lo = 0
  let hi = blocks.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (blocks[mid].line <= line) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (ans === -1) {
    if (syncBox.scrollTop !== 0) syncBox.scrollTop = 0
    return
  }
  const { el } = blocks[ans]
  const scale = activePreviewMode.value.value === 'full' ? 1 : previewScale.value || 1
  const top =
    (el.getBoundingClientRect().top - syncBoxTop) / scale + syncBox.scrollTop - 20
  const next = Math.max(0, top)
  // 行级同步：同一行内滚动时目标不变，跳过写入避免无谓重排
  if (Math.abs(syncBox.scrollTop - next) < 0.5) return
  syncBox.scrollTop = next
}

// 预览点击定位：找到带 data-line 的块，切回对照并把编辑器光标送到对应源码行
function onPreviewClick(event) {
  event.preventDefault()
  const block = event.target.closest?.('[data-line]')
  if (!block) return
  const line = Number(block.dataset.line)
  if (!Number.isFinite(line)) return
  if (viewMode.value !== 'split') setViewMode('split')
  nextTick(() => editorRef.value?.scrollToLine(line))
}

function measurePreviewFrame() {
  // 布局变化（窗口缩放、设备切换）后滚动缓存作废
  resetSyncCache()
  const stage = previewStage.value
  const mode = activePreviewMode.value
  if (!stage || !mode.width || !mode.height) {
    previewScale.value = 1
    return
  }

  const scale = Math.min(1, stage.clientWidth / mode.width, stage.clientHeight / mode.height)
  previewScale.value = Number.isFinite(scale) && scale > 0 ? scale : 1
}

// ---- 分隔条拖拽 / 键盘调整 ----

let dragCleanup = null

function setEditorPct(clientX) {
  if (!mainRef.value) return
  const rect = mainRef.value.getBoundingClientRect()
  const pct = ((clientX - rect.left) / rect.width) * 100
  store.settings.editorPct = Math.min(70, Math.max(25, Math.round(pct)))
}

function stopDrag() {
  document.body.classList.remove('col-resizing')
  dragCleanup?.()
  dragCleanup = null
}

function startDrag(ev) {
  if (ev.button !== 0) return
  ev.preventDefault()
  // 指针捕获：拖出浏览器窗口外松手也能收到 pointerup，避免拖拽状态卡死；
  // 触摸设备上配合 .divider 的 touch-action:none 才能正常拖动
  try {
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
  } catch {
    // 指针已释放等场景下捕获失败，忽略
  }
  document.body.classList.add('col-resizing')
  setEditorPct(ev.clientX)
  const move = (event) => setEditorPct(event.clientX)
  const end = () => stopDrag()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  // 失焦兜底（切换窗口等场景）
  window.addEventListener('blur', end)
  dragCleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }
}

function resizeBy(delta) {
  store.settings.editorPct = Math.min(70, Math.max(25, store.settings.editorPct + delta))
}

// ---- 复制 / 导入导出 / 样章 ----

// 量取预览中画廊图片的宽高比并注册（blob: 反查回 local: 引用），
// 供对齐式画廊按各图比例分配宽度；学到新值会触发一次重渲染。
function rawSrcKey(src) {
  if (src.startsWith('blob:')) {
    const hit = getCachedImageEntries().find(([, url]) => url === src)
    if (hit) return `local:${hit[0]}`
  }
  return src
}

async function collectImageAspects() {
  const imgs = [...document.querySelectorAll('.wechat-chrome [data-gallery-mode] img')]
  let learned = 0
  // 并行等待未加载完成的图（同一文档里的图同时下载），单张超时 1.5s 兜底
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.naturalWidth) {
        await new Promise((res) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            img.onload = null
            img.onerror = null
            res()
          }
          img.onload = finish
          img.onerror = finish
          window.setTimeout(finish, 1500)
        })
      }
      if (!img.naturalWidth || !img.naturalHeight) return
      if (registerImageAspect(rawSrcKey(img.getAttribute('src') || ''), img.naturalWidth, img.naturalHeight)) {
        learned += 1
      }
    })
  )
  if (learned) store.aspectVersion += 1
}

// ---- 画廊拖拽微调：拖动两格之间的边界，松手自动对齐，覆盖值按图片地址记忆 ----
// 对齐采用解析解而非实测反解：同排同高的齐平宽度是各图宽高比的纯函数，
// 按下时算一次即为常数，吸附不会因布局反馈而振荡（旧实现的乱跳根源）。

// 右列内两图等宽堆叠、间隙为右列宽的 1.2%——与渲染器 justifiedWidths 的公式
// 同源同参数，保证"吸附位置"就是"渲染器默认对齐位置"。
function aspectOfImg(img) {
  const v = Number(getImageAspect(rawSrcKey(img.getAttribute('src') || '')))
  return Number.isFinite(v) && v > 0.1 && v < 10 ? v : 4 / 3
}

// 两格并排排的解析齐平解：左格宽度百分比，使左格底边与右列（单图或多图）精确齐平
function flushPctOf(c0Img, c1Imgs) {
  if (!c0Img || !c1Imgs.length) return null
  const a0 = aspectOfImg(c0Img)
  const rest = c1Imgs.map((im) => aspectOfImg(im)).filter((a) => a > 0)
  if (!rest.length) return null
  const S = rest.reduce((sum, a) => sum + 1 / a, 0) + (rest.length > 1 ? 0.012 : 0)
  const pct = ((100 - 1.2) * S) / (1 / a0 + S)
  return Math.min(85, Math.max(15, Math.round(pct * 100) / 100))
}

let galDrag = null
let galMoveRaf = 0

function onGalleryPointerDown(e) {
  if (e.button !== 0) return
  const img = e.target.closest?.('.wechat-chrome [data-gallery-mode] img')
  if (!img) return
  const cell = img.closest('section')
  const row = cell?.parentElement
  // 只处理恰好两格、且左右并排的排（两图画廊 / 三图拼贴的左大图与右列）。
  // 四图以上拼贴的“整行 + 下行”也是两个 section，但不是并排，拖它们会改坏布局。
  if (!row || !row.hasAttribute('data-gallery-mode')) return
  // 网格与单列是均分/整幅语义，宽度没有自由度，不提供手动微调
  if (row.dataset.galleryMode === 'grid' || row.dataset.galleryMode === 'stack') return
  const cells = [...row.children].filter((el) => el.tagName === 'SECTION')
  if (cells.length !== 2 || !cells.includes(cell)) return
  if (Math.abs(cells[0].getBoundingClientRect().top - cells[1].getBoundingClientRect().top) > 4) return
  // 指针捕获：拖出窗口外松手也能收尾，配合 touch-action:none 支持触摸拖动
  try {
    row.setPointerCapture?.(e.pointerId)
  } catch {
    // 指针已释放等场景下捕获失败，忽略
  }
  // 按下即显示高亮边框，明确当前调整的是哪一排
  row.classList.add('gal-active')
  // 统一调整左格宽度（右格 flex 自动补位），点哪边拖都一样
  const [c0, c1] = cells
  const c0Img = c0.querySelector('img')
  const c1Imgs = [...c1.querySelectorAll('img')]
  // 右列多图 = 裁切填充结构（三图/焦点区）：任何宽度都齐平，拖拽完全自由；
  // 右列单图 = 同高并排（两图画廊）：吸附到解析齐平解（常数，永不振荡）
  const alignedPct = flushPctOf(c0Img, c1Imgs)
  galDrag = {
    keyImg: c0Img,
    c1Imgs,
    a0: aspectOfImg(c0Img),
    free: c1Imgs.length > 1,
    c0,
    c1,
    row,
    startX: e.clientX,
    startW: c0.getBoundingClientRect().width,
    rowW: row.getBoundingClientRect().width,
    alignedPct,
    moved: false,
    pct: null,
    snapped: false,
  }
  const move = (ev) => {
    if (galMoveRaf) return
    // rAF 节流：鼠标高频事件只按帧处理，拖动更流畅
    galMoveRaf = requestAnimationFrame(() => {
      galMoveRaf = 0
      onGalleryPointerMove(ev)
    })
  }
  const end = () => {
    cancelAnimationFrame(galMoveRaf)
    galMoveRaf = 0
    onGalleryPointerUp()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  // 失焦兜底（切换窗口等场景）
  window.addEventListener('blur', end)
}

function onGalleryPointerMove(e) {
  const d = galDrag
  if (!d) return
  const dx = e.clientX - d.startX
  if (!d.moved && Math.abs(dx) < 6) return
  if (!d.moved) {
    d.row.classList.add('gal-active')
    document.body.style.cursor = 'ew-resize'
    // 拖动期间禁止选中正文（CSS 里 user-select: none）
    document.body.classList.add('gal-dragging')
  }
  d.moved = true
  e.preventDefault()
  let pct = Math.min(85, Math.max(15, ((d.startW + dx) / d.rowW) * 100))
  if (d.free) {
    // 右列裁切填充：左图拖到任何宽度，右列实时裁切匹配，底边始终齐平
    applyRightColumn(d, pct)
    d.snapped = false
    d.row.classList.remove('gal-snapped')
  } else {
    // 两格同高排：吸附到解析齐平解（常数，无布局反馈，不会振荡）。
    // 靠近吸住、拉远才松开（迟滞）；阈值 2% ≈ 手机上约 8px 底边差
    if (d.alignedPct != null) {
      const err = Math.abs(pct - d.alignedPct)
      if (d.snapped ? err > 5 : err < 2) d.snapped = !d.snapped
      if (d.snapped) pct = d.alignedPct
      d.row.classList.toggle('gal-snapped', d.snapped)
    }
  }
  d.pct = pct
  d.c0.style.width = `${pct}%`
}

// 拖拽中实时更新右列两图的裁切比例（与渲染器 rightColumnRatio 同公式）
function applyRightColumn(d, pct) {
  if (!d.a0) return
  const leftH = pct / d.a0
  const rightW = 100 - 1.2 - pct
  const itemH = (leftH - 1.2) / 2
  if (!(rightW > 5) || !(itemH > 5)) return
  const ratio = `${Math.round(rightW * 100) / 100}/${Math.round(itemH * 100) / 100}`
  for (const im of d.c1Imgs) im.style.aspectRatio = ratio
}

function onGalleryPointerUp() {
  const d = galDrag
  galDrag = null
  if (!d) return
  d.row.classList.remove('gal-active', 'gal-snapped')
  document.body.style.cursor = ''
  document.body.classList.remove('gal-dragging')
  if (!d.moved) return
  if (d.pct != null) {
    setGalleryOverride(rawSrcKey(d.keyImg?.getAttribute('src') || ''), d.pct)
    // 两格同高排拖出吸附带：保留用户位置，明确告知如何恢复对齐；
    // 裁切填充结构（free）永远齐平，无需提示
    if (!d.free && !d.snapped) notify('已调整宽度（双击图片可恢复自动对齐）')
  }
  // 抑制拖拽后的 click 触发预览定位
  const swallow = (ev) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  document.addEventListener('click', swallow, { capture: true, once: true })
}

function onGalleryDblClick(e) {
  const img = e.target.closest?.('.wechat-chrome [data-gallery-mode] img')
  if (!img) return
  if (clearGalleryOverride(rawSrcKey(img.getAttribute('src') || ''))) notify('已恢复自动对齐')
}

// 本地视频的复制策略：≤ 阈值的视频内联成 data URI 随 HTML 带走；
// 超过阈值统一转为带文件名的占位卡（粘贴后在公众号后台插入真视频）。
// 官方限制（已实测确认）：公众号保存要求"正文总大小 ≤ 10M 字节"，内联视频
// base64 后计入正文，故按文件 ≤7.5MB 内联（base64 后 ≈10M，贴线达标）。
const INLINE_VIDEO_LIMIT = 7.5 * 1024 * 1024 // 7.5MB（base64 后约 10M 正文）
const INLINE_IMAGE_LIMIT = 900 * 1024 // 微信粘贴大 PNG 时先尝试压成 JPEG

async function replaceLargeVideos(htmlText) {
  if (!htmlText.includes('data-lv="1"')) return htmlText
  const sectionRe = /<section[^>]*data-lv="1"[^>]*>[\s\S]*?<\/section>/g
  const srcRe = /<video[^>]*src="([^"]+)"/i
  const jobs = []
  htmlText = htmlText.replace(sectionRe, (block) => {
    const m = block.match(srcRe)
    jobs.push({ block, src: m?.[1] || '' })
    return block // 先占位，异步判断大小后再决定替换
  })
  const replace = new Map()
  await Promise.all(
    jobs.map(async (job) => {
      const id = rawSrcKey(job.src) // blob: 反查回 local:vid-xxx
      let size = 0
      if (id.startsWith('local:')) {
        const blob = await getImage(id.slice('local:'.length))
        size = blob?.size || 0
      }
      // 拿不到 blob（已清理）也转占位，避免复制出死链接
      if (!id.startsWith('local:') || size > INLINE_VIDEO_LIMIT) {
        const name = job.block.match(/data-name="([^"]+)"/i)?.[1] || ''
        replace.set(job.block, copyVideoPlaceholder(name))
      }
    })
  )
  for (const [from, to] of replace) htmlText = htmlText.split(from).join(to)
  return htmlText
}

async function doCopy() {
  // 公开号页面必须在真实点击手势内尽快写入剪贴板；公开资源已经是 HTTPS 图片，
  // 不再等待本地图片测量、视频处理或 IndexedDB 查询，避免移动端丢失 transient activation。
  if (publicMode.value) {
    let publicHtml = removeLeadingArticleTitle(stripPreviewMeta(html.value))
    const ok = await copyRichText(publicHtml)
    notify(ok ? '排版已复制，可以去公众号助手粘贴了' : '复制失败，请检查浏览器剪贴板权限')
    return ok
  }
  await collectImageAspects()
  await nextTick()
  // 先剥离预览标记、按大小处理视频，再内联 blob 图片（避免处理巨型 base64 字符串）
  let htmlText = stripPreviewMeta(html.value)
  htmlText = await replaceLargeVideos(htmlText)
  // 公开页和公众号编辑器都有独立标题字段，复制正文时不要重复插入文章级 H1。
  htmlText = removeLeadingArticleTitle(htmlText)
  const ok = await copyRichText(await inlineLocalImages(htmlText))
  notify(ok ? '排版已复制，可以去公众号后台粘贴了' : '复制失败，请手动全选预览内容')
  return ok
}

async function getAutomationPublishPayload() {
  const validation = await validateAutomationArticle()
  if (!validation.valid) throw new Error(validation.errors.join('；'))
  await collectImageAspects()
  await nextTick()
  let htmlText = stripPreviewMeta(html.value)
  htmlText = await replaceLargeVideos(htmlText)
  htmlText = await inlineLocalImages(htmlText)
  // 三个平台都有独立标题字段，正文不重复插入文章级 h1。
  htmlText = removeLeadingArticleTitle(htmlText)
  return {
    title: documentTitle.value,
    html: htmlText,
    text: htmlToPlainText(htmlText),
    validation,
    generatedAt: new Date().toISOString(),
  }
}

// 把 HTML 里图片、小视频的 blob: 链接统一还原成 data URI
// （公众号无法读取 blob: 链接，粘贴时需要真实媒体数据）
async function inlineLocalImages(htmlText) {
  for (const [id, url] of getCachedImageEntries()) {
    if (!htmlText.includes(url)) continue
    const blob = await getImage(id)
    if (!blob) continue
    htmlText = htmlText.split(url).join(await blobToPortableDataUrl(blob))
  }
  return htmlText
}

// 微信编辑器对超大 data:image PNG 的粘贴兼容性较差。对不透明的大图
// 尝试转成 JPEG；若转换失败或结果更大，则保留原始格式，避免损失内容。
async function blobToPortableDataUrl(blob) {
  if (!blob.type.startsWith('image/') || blob.size <= INLINE_IMAGE_LIMIT || blob.type === 'image/jpeg') {
    return blobToDataUrl(blob)
  }
  let bitmap
  let objectUrl
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob)
    } else {
      objectUrl = URL.createObjectURL(blob)
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('image decode failed'))
        image.src = objectUrl
      })
    }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return blobToDataUrl(blob)
    context.drawImage(bitmap, 0, 0)
    // 有透明通道的图保留 PNG，避免把透明内容强行变成黑底。
    if (blob.type === 'image/png') {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) return blobToDataUrl(blob)
      }
    }
    const compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84))
    if (!compressed || compressed.size >= blob.size) return blobToDataUrl(blob)
    return blobToDataUrl(compressed)
  } catch {
    return blobToDataUrl(blob)
  } finally {
    bitmap?.close?.()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function copySource() {
  let htmlText = stripPreviewMeta(html.value)
  htmlText = await replaceLargeVideos(htmlText)
  const ok = await copyText(await inlineLocalImages(htmlText))
  notify(ok ? 'HTML 源码已复制' : '复制失败')
}

function exportMd() {
  const name = documentTitle.value.replace(/[\\/:*?"<>|]/g, '')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([store.md], { type: 'text/markdown;charset=utf-8' }))
  a.download = `${name}.md`
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 0)
  notify('已导出 Markdown 文件')
}

function importMd() {
  fileInput.value?.click()
}

function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    notify('文件超过 5 MB，请拆分后再导入')
    e.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    importContents([{ name: file.name, content: String(reader.result || '') }])
    notify(`已导入「${file.name}」为新文章`)
  }
  reader.onerror = () => notify('文件读取失败，请重试')
  reader.readAsText(file)
  e.target.value = ''
}

function resetDoc() {
  createDocument(sample)
  notify('已新建默认样章')
}

function loadSample(id) {
  const item = samples.find((entry) => entry.id === id)
  if (!item) return
  importContents([{ name: item.title, content: item.md }])
  notify(`已载入「${item.title}」为新文章`)
}

function restoreLastDocument() {
  if (!store.backupMd) return
  restoreDocument()
  notify('已恢复替换前的文章')
}

function onCmd(cmd) {
  editorRef.value?.exec(cmd)
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyC') {
    e.preventDefault()
    doCopy()
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
    e.preventDefault()
    notify('文章已自动保存到本机')
  }
}

// ---- 本地 AI 控制桥 ----

const SAFE_SETTING_KEYS = new Set([
  'fontSize',
  'fontFamily',
  'macCode',
  'previewWidth',
  'editorPct',
  'viewMode',
  'galleryMode',
  'galleryRatio',
])

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function documentSummary(doc, { includeContent = false } = {}) {
  const summary = {
    id: doc.id,
    title: docTitle(doc.content),
    charCount: countChars(doc.content),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
  if (includeContent) summary.content = doc.content
  return summary
}

function safeSettings() {
  const settings = cloneJson(store.settings)
  delete settings.imageHost
  return settings
}

function getDocumentOrThrow(id) {
  const targetId = id || store.activeDocId
  const doc = store.docs.find((item) => item.id === targetId)
  if (!doc) throw new Error(`文章不存在：${targetId}`)
  return doc
}

function assertContent(content) {
  if (typeof content !== 'string') throw new Error('content 必须是字符串')
  if (new TextEncoder().encode(content).byteLength > 5 * 1024 * 1024) {
    throw new Error('文章内容超过 5 MB 限制')
  }
}

function findDocumentByTitle(title) {
  const clean = String(title || '').trim()
  if (!clean) return null
  return [...store.docs]
    .filter((doc) => docTitle(doc.content) === clean)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null
}

function decodeAssetData(data, mimeType = 'application/octet-stream') {
  if (typeof data !== 'string' || !data) throw new Error('asset.data 必须是非空 base64 或 data URL')
  const match = data.match(/^data:([^;,]+)?;base64,(.*)$/s)
  const mime = match?.[1] || mimeType || 'application/octet-stream'
  const encoded = (match?.[2] || data).replace(/\s/g, '')
  if (!encoded || encoded.length > 9_500_000) throw new Error('单个资源超过控制桥 10 MB 限制')
  let binary
  try {
    binary = atob(encoded)
  } catch {
    throw new Error('asset.data 不是有效的 base64 数据')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function assetAnchorPatterns(anchor) {
  const key = String(anchor || '').trim()
  if (!key) throw new Error('asset.anchor 不能为空')
  return [`{{IMAGE:${key}}}`, `<!-- IMAGE:${key} -->`]
}

async function importAutomationAsset(asset = {}) {
  const patterns = assetAnchorPatterns(asset.anchor)
  const current = String(store.md || '')
  if (!patterns.some((pattern) => current.includes(pattern))) {
    throw new Error(`文章中找不到图片锚点：${patterns[0]}`)
  }
  const blob = decodeAssetData(asset.data, asset.mimeType)
  const id = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await putImage(id, blob)
  cacheImage(id, blob)
  const alt = String(asset.caption || asset.alt || asset.filename || `图片 ${asset.anchor}`).trim()
  const replacement = `![${alt.replace(/[\[\]]/g, '')}](local:${id})`
  let next = current
  for (const pattern of patterns) next = next.split(pattern).join(replacement)
  replaceDocument(next)
  store.imageCacheVersion += 1
  return { anchor: asset.anchor, id, filename: asset.filename || '', bytes: blob.size, replacement }
}

async function importAutomationAssets(assets = [], documentId) {
  const doc = getDocumentOrThrow(documentId)
  selectDocument(doc.id)
  const list = Array.isArray(assets) ? assets : []
  if (!list.length) throw new Error('assets 不能为空')
  const current = String(store.md || '')
  for (const asset of list) {
    const patterns = assetAnchorPatterns(asset.anchor)
    if (!patterns.some((pattern) => current.includes(pattern))) {
      throw new Error(`文章中找不到图片锚点：${patterns[0]}`)
    }
  }
  const imported = []
  for (const asset of list) imported.push(await importAutomationAsset(asset))
  await nextTick()
  flushPendingWrites()
  return { imported, document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
}

async function validateAutomationArticle(expectedTitle = '') {
  const title = documentTitle.value
  const content = String(store.md || '')
  const anchors = [...content.matchAll(/\{\{IMAGE:([^}]+)\}\}|<!--\s*IMAGE:([^>]+?)\s*-->/g)]
    .map((match) => String(match[1] || match[2] || '').trim())
  const localIds = [...new Set([...content.matchAll(/local:([a-z0-9][a-z0-9-]*)/g)].map((match) => match[1]))]
  const missingMedia = []
  for (const id of localIds) if (!(await getImage(id))) missingMedia.push(id)
  const errors = []
  if (expectedTitle && title !== expectedTitle) errors.push(`标题不匹配：${title}`)
  if (anchors.length) errors.push(`仍有 ${anchors.length} 个图片锚点未替换`)
  if (missingMedia.length) errors.push(`缺少本地图片：${missingMedia.join(', ')}`)
  return { valid: errors.length === 0, title, imageCount: localIds.length, anchors, missingMedia, errors }
}

function applySafeSettings(next) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    throw new Error('settings 必须是对象')
  }
  for (const key of Object.keys(next)) {
    if (!SAFE_SETTING_KEYS.has(key)) throw new Error(`不允许修改设置：${key}`)
  }
  if ('fontSize' in next) {
    const value = Number(next.fontSize)
    if (!Number.isFinite(value) || value < 12 || value > 32) throw new Error('fontSize 必须在 12 到 32 之间')
    store.settings.fontSize = Math.round(value)
  }
  if ('fontFamily' in next && !['theme', 'serif', 'sans', 'mono'].includes(next.fontFamily)) {
    throw new Error('fontFamily 必须是 theme、serif、sans 或 mono')
  }
  if ('previewWidth' in next && !['full', 'mobile', 'desktop'].includes(next.previewWidth)) {
    throw new Error('previewWidth 必须是 full、mobile 或 desktop')
  }
  if ('viewMode' in next && !['split', 'preview'].includes(next.viewMode)) {
    throw new Error('viewMode 必须是 split 或 preview')
  }
  if ('galleryMode' in next && !['collage', 'grid', 'stack'].includes(next.galleryMode)) {
    throw new Error('galleryMode 必须是 collage、grid 或 stack')
  }
  if ('galleryRatio' in next && !['1:1', '4:5', '3:4'].includes(next.galleryRatio)) {
    throw new Error('galleryRatio 必须是 1:1、4:5 或 3:4')
  }
  if ('editorPct' in next) {
    const value = Number(next.editorPct)
    if (!Number.isFinite(value) || value < 25 || value > 70) throw new Error('editorPct 必须在 25 到 70 之间')
    store.settings.editorPct = Math.round(value)
  }
  if ('fontFamily' in next) store.settings.fontFamily = next.fontFamily
  if ('macCode' in next) store.settings.macCode = Boolean(next.macCode)
  if ('previewWidth' in next) store.settings.previewWidth = next.previewWidth
  if ('viewMode' in next) store.settings.viewMode = next.viewMode
  if ('galleryMode' in next) store.settings.galleryMode = next.galleryMode
  if ('galleryRatio' in next) store.settings.galleryRatio = next.galleryRatio
}

async function executeAutomationAction(action, args = {}) {
  switch (action) {
    case 'get_state': {
      await nextTick()
      const includeContent = Boolean(args.includeContent)
      return {
        activeDocument: documentSummary(getDocumentOrThrow(), { includeContent }),
        documents: store.docs.map((doc) => documentSummary(doc)),
        trash: store.trash.map((doc) => documentSummary(doc)),
        theme: { id: theme.value.id, name: theme.value.name },
        settings: safeSettings(),
        backupAvailable: typeof store.backupMd === 'string' && store.backupMd.length > 0,
        ...(args.includeHtml ? { html: stripPreviewMeta(html.value) } : {}),
      }
    }
    case 'list_documents':
      return {
        activeDocumentId: store.activeDocId,
        documents: store.docs.map((doc) => documentSummary(doc)),
        trash: store.trash.map((doc) => documentSummary(doc)),
      }
    case 'get_document': {
      const doc = getDocumentOrThrow(args.documentId)
      return { document: documentSummary(doc, { includeContent: true }) }
    }
    case 'set_document': {
      assertContent(args.content)
      const doc = getDocumentOrThrow(args.documentId)
      selectDocument(doc.id)
      const changed = replaceDocument(args.content)
      await nextTick()
      flushPendingWrites()
      return { changed, document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
    }
    case 'create_document': {
      const content = args.content ?? `# ${String(args.title || '未命名文章').trim() || '未命名文章'}\n\n`
      assertContent(content)
      const doc = createDocument(content)
      await nextTick()
      flushPendingWrites()
      return { document: documentSummary(doc, { includeContent: true }) }
    }
    case 'upsert_document': {
      assertContent(args.content)
      const title = String(args.title || docTitle(args.content)).trim()
      let doc = args.documentId ? getDocumentOrThrow(args.documentId) : findDocumentByTitle(title)
      if (doc) {
        selectDocument(doc.id)
        replaceDocument(args.content)
        flushPendingWrites()
        return { created: false, document: documentSummary(getDocumentOrThrow(doc.id), { includeContent: true }) }
      }
      doc = createDocument(args.content)
      await nextTick()
      flushPendingWrites()
      return { created: true, document: documentSummary(doc, { includeContent: true }) }
    }
    case 'select_document': {
      const doc = getDocumentOrThrow(args.documentId)
      selectDocument(doc.id)
      await nextTick()
      return { document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
    }
    case 'rename_document': {
      const doc = getDocumentOrThrow(args.documentId)
      const title = String(args.title || '').trim()
      if (!title) throw new Error('title 不能为空')
      renameDocument(doc.id, title)
      await nextTick()
      flushPendingWrites()
      return { document: documentSummary(getDocumentOrThrow(doc.id), { includeContent: true }) }
    }
    case 'delete_document': {
      const doc = getDocumentOrThrow(args.documentId)
      deleteDocument(doc.id)
      await nextTick()
      flushPendingWrites()
      return { activeDocumentId: store.activeDocId, documents: store.docs.map((item) => documentSummary(item)) }
    }
    case 'restore_from_trash': {
      const id = String(args.documentId || '')
      if (!store.trash.some((doc) => doc.id === id)) throw new Error(`回收站中不存在：${id}`)
      restoreFromTrash(id)
      await nextTick()
      flushPendingWrites()
      return { document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
    }
    case 'remove_from_trash': {
      const id = String(args.documentId || '')
      if (!store.trash.some((doc) => doc.id === id)) throw new Error(`回收站中不存在：${id}`)
      removeFromTrash(id)
      return { trash: store.trash.map((doc) => documentSummary(doc)) }
    }
    case 'set_theme': {
      const nextTheme = themes.find((item) => item.id === args.themeId)
      if (!nextTheme) throw new Error(`主题不存在：${args.themeId}`)
      store.themeId = nextTheme.id
      if (args.accent !== undefined) setActiveAccent(args.accent || null)
      if (args.slotColors && typeof args.slotColors === 'object') {
        for (const [key, value] of Object.entries(args.slotColors)) setSlotColor(key, value || null)
      }
      await nextTick()
      flushPendingWrites()
      return { theme: { id: theme.value.id, name: theme.value.name }, settings: safeSettings() }
    }
    case 'list_themes':
      return {
        themes: themes.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.description,
        })),
      }
    case 'set_settings':
      applySafeSettings(args.settings)
      await nextTick()
      flushPendingWrites()
      return { settings: safeSettings() }
    case 'render_preview':
      await nextTick()
      return {
        title: documentTitle.value,
        theme: { id: theme.value.id, name: theme.value.name },
        html: stripPreviewMeta(html.value),
      }
    case 'load_sample': {
      const item = samples.find((entry) => entry.id === args.sampleId)
      if (!item) throw new Error(`示例文章不存在：${args.sampleId}`)
      const docs = importContents([{ name: item.title, content: item.md }])
      await nextTick()
      flushPendingWrites()
      return { document: documentSummary(docs[docs.length - 1], { includeContent: true }) }
    }
    case 'restore_backup': {
      const changed = restoreDocument()
      await nextTick()
      flushPendingWrites()
      return { changed, document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
    }
    case 'import_asset': {
      const doc = getDocumentOrThrow(args.documentId)
      selectDocument(doc.id)
      const imported = await importAutomationAsset(args.asset)
      await nextTick()
      flushPendingWrites()
      return { imported, document: documentSummary(getDocumentOrThrow(), { includeContent: true }) }
    }
    case 'import_assets': {
      return await importAutomationAssets(args.assets, args.documentId)
    }
    case 'prepare_article': {
      assertContent(args.content)
      const title = String(args.title || docTitle(args.content)).trim()
      const upserted = await executeAutomationAction('upsert_document', { content: args.content, title, documentId: args.documentId })
      const imported = args.assets?.length
        ? await importAutomationAssets(args.assets, upserted.document.id)
        : { imported: [], document: upserted.document }
      if (args.themeId) {
        const nextTheme = themes.find((item) => item.id === args.themeId)
        if (!nextTheme) throw new Error(`主题不存在：${args.themeId}`)
        store.themeId = nextTheme.id
      }
      if (args.settings) applySafeSettings(args.settings)
      await nextTick()
      flushPendingWrites()
      return {
        created: upserted.created,
        document: imported.document,
        imported: imported.imported,
        theme: { id: theme.value.id, name: theme.value.name },
        settings: safeSettings(),
        validation: await validateAutomationArticle(title),
        preview: { title: documentTitle.value, html: stripPreviewMeta(html.value) },
      }
    }
    case 'copy_rich_text': {
      const validation = await validateAutomationArticle(args.expectedTitle)
      if (!validation.valid) {
        return { copied: false, requiresUiClick: false, validation, message: validation.errors.join('；') }
      }
      const ok = await doCopy()
      return {
        copied: Boolean(ok),
        requiresUiClick: !ok,
        validation,
        message: ok ? '富文本已复制到剪贴板' : '复制失败，请在网页中手动点击复制富文本',
      }
    }
    case 'get_publish_payload':
      return await getAutomationPublishPayload()
    case 'validate_article': {
      return await validateAutomationArticle(args.expectedTitle)
    }
    case 'clear_backup': {
      clearBackup()
      return { cleared: true }
    }
    case 'prune_media': {
      return await pruneImages(usedImageIds())
    }
    default:
      throw new Error(`未知自动化操作：${action}`)
  }
}

let previewResizeObserver = null

onMounted(() => {
  if (!publicMode.value) stopAutomationBridge = startAutomationBridge(executeAutomationAction)
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onGalleryPointerDown)
  document.addEventListener('dblclick', onGalleryDblClick)
  previewResizeObserver = new ResizeObserver(measurePreviewFrame)
  if (previewStage.value) previewResizeObserver.observe(previewStage.value)
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
    collectImageAspects()
  })
  loadPublicArticle()
})

onBeforeUnmount(() => {
  stopAutomationBridge()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onGalleryPointerDown)
  document.removeEventListener('dblclick', onGalleryDblClick)
  previewResizeObserver?.disconnect()
  clearTimeout(mediaPassTimer)
  stopDrag()
})
</script>

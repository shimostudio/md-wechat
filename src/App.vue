<template>
  <div class="app-d">
    <TopBar @import="importMd" @export="exportMd" @sync-folder="openDocuments" />

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
import { store, theme, notify, restoreDocument, createDocument, importContents } from './lib/store.js'
import { themes } from './lib/themes.js'
import { renderMarkdown, stripPreviewMeta } from './lib/renderer.js'
import { copyRichText, copyText } from './lib/clipboard.js'
import { sample, samples } from './lib/sample.js'

const editorRef = ref(null)
const fileInput = ref(null)
const mainRef = ref(null)
const previewStage = ref(null)
const previewViewport = ref(null)
const previewScale = ref(1)

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

const html = computed(() =>
  renderMarkdown(store.md, renderTheme.value, {
    ...store.settings,
    accent: store.settings.accentByTheme?.[renderTheme.value.id] || null,
    slotColors: store.settings.accentSlotsByTheme?.[renderTheme.value.id] || null,
    custom: (store.settings.custom || {})[renderTheme.value.id],
  })
)
const charCount = computed(() => store.md.replace(/\s/g, '').length)
const readMinutes = computed(() => Math.max(1, Math.ceil(charCount.value / 400)))
const documentTitle = computed(() => {
  const match = store.md.match(/^#\s+(.+?)\s*$/m)
  return (match?.[1] || '未命名文章').replace(/[*_`~[\]]/g, '').trim()
})

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
}

watch(html, () => nextTick(rebuildBlocks))
watch(viewMode, () =>
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
  })
)
watch(
  () => activePreviewMode.value.value,
  () =>
    nextTick(() => {
      measurePreviewFrame()
      rebuildBlocks()
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

function onEditorScroll(line) {
  const box = findScroller(previewViewport.value)
  if (!box || !blocks.length) return
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
    box.scrollTop = 0
    return
  }
  const { el } = blocks[ans]
  const scale = activePreviewMode.value.value === 'full' ? 1 : previewScale.value || 1
  const top =
    (el.getBoundingClientRect().top - box.getBoundingClientRect().top) / scale +
    box.scrollTop -
    20
  box.scrollTop = Math.max(0, top)
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
  document.body.classList.add('col-resizing')
  setEditorPct(ev.clientX)
  const move = (event) => setEditorPct(event.clientX)
  const up = () => stopDrag()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  dragCleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
}

function resizeBy(delta) {
  store.settings.editorPct = Math.min(70, Math.max(25, store.settings.editorPct + delta))
}

// ---- 复制 / 导入导出 / 样章 ----

async function doCopy() {
  const ok = await copyRichText(stripPreviewMeta(html.value))
  notify(ok ? '排版已复制，可以去公众号后台粘贴了' : '复制失败，请手动全选预览内容')
}

async function copySource() {
  const ok = await copyText(stripPreviewMeta(html.value))
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

let previewResizeObserver = null

onMounted(() => {
  window.addEventListener('keydown', onKey)
  previewResizeObserver = new ResizeObserver(measurePreviewFrame)
  if (previewStage.value) previewResizeObserver.observe(previewStage.value)
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  previewResizeObserver?.disconnect()
  stopDrag()
})
</script>

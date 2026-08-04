<template>
  <aside
    id="documents-panel"
    class="sidebar"
    :class="{ closed: !store.ui.drawerOpen }"
    :aria-hidden="!store.ui.drawerOpen"
    :inert="!store.ui.drawerOpen"
  >
    <div class="sidebar-inner">
      <div class="panel-head">
        <h2>{{ documentView === 'trash' ? '回收站' : '我的文档' }}</h2>
        <button
          class="panel-x"
          type="button"
          :title="documentView === 'trash' ? '收起回收站' : '收起文档栏'"
          @click="store.ui.drawerOpen = false"
        >
          <Icon name="x" :size="13" aria-hidden="true" />
        </button>
      </div>

      <template v-if="documentView === 'documents'">
        <div class="side-section">
          <h2>我的文章</h2>
          <span>{{ store.docs.length }} 篇</span>
        </div>
        <div class="side-search">
          <Icon name="search" :size="13" aria-hidden="true" />
          <input v-model="query" type="search" placeholder="搜索文章" aria-label="搜索文章" />
        </div>

        <div class="doc-list">
          <div
            v-for="doc in visibleDocs"
            :key="doc.id"
            class="doc"
            :class="{ active: doc.id === store.activeDocId }"
            @click="selectDocument(doc.id)"
          >
            <div class="doc-title">{{ docTitle(doc.content) }}</div>
            <div class="doc-meta">{{ wordCount(doc.content) }} 字 · {{ formatTime(doc.updatedAt) }}</div>
            <button
              class="doc-more"
              type="button"
              title="更多操作"
              :aria-label="`更多操作：${docTitle(doc.content)}`"
              :aria-expanded="menuFor === doc.id"
              @click.stop="toggleMenu(doc.id)"
            >
              <Icon name="more" :size="14" aria-hidden="true" />
            </button>
            <div v-if="menuFor === doc.id" class="doc-menu" @click.stop>
              <button type="button" @click="renameDoc(doc)">重命名</button>
              <button type="button" @click="exportDoc(doc)">导出 .md</button>
              <button type="button" class="danger" @click="deleteDoc(doc)">删除</button>
            </div>
          </div>
          <div v-if="query && !visibleDocs.length" class="doc-empty">没有匹配的文章</div>
        </div>

        <button class="doc-new" type="button" @click="createNew">＋ 新建文章</button>

        <div class="side-divider"></div>

        <div class="side-section">
          <h2>本地存档</h2>
        </div>
        <div class="archive">
          <button class="arc-btn" type="button" @click="importInput?.click()">
            <Icon name="upload" :size="15" aria-hidden="true" />
            导入 Markdown（可多选）
          </button>

          <template v-if="store.archive.status === 'on'">
            <div class="arc-dir">
              <div class="arc-dir-row">
                <Icon name="folder" :size="14" aria-hidden="true" />
                <span class="arc-dir-path" :title="store.archive.dirName">{{ store.archive.dirName }}</span>
                <button class="arc-dir-change" type="button" @click="changeDir">更改</button>
              </div>
              <div class="arc-dir-hint">已开启目录存档：文章会<b>自动同步为 .md 文件</b>存到该目录，换电脑、重装浏览器都不丢。</div>
            </div>
          </template>

          <template v-else-if="store.archive.status === 'prompt'">
            <button class="arc-btn" type="button" @click="reauth">
              <Icon name="folder" :size="15" aria-hidden="true" />
              重新授权存档目录{{ store.archive.dirName ? `（${store.archive.dirName}）` : '' }}
            </button>
            <div class="arc-hint">浏览器需要重新授权后才能继续同步。</div>
          </template>

          <template v-else-if="store.archive.status === 'unsupported'">
            <div class="arc-hint">当前浏览器不支持目录存档（Chrome / Edge 可用），用「导入 / 导出 .md」手动留档即可。</div>
          </template>

          <template v-else>
            <button class="arc-btn" type="button" @click="enable">
              <Icon name="folder" :size="15" aria-hidden="true" />
              选择存档目录，开启自动同步
            </button>
            <div class="arc-hint">开启后文章自动同步为 .md 存到你选的文件夹。</div>
          </template>
        </div>
      </template>

      <section v-else class="trash-view" aria-labelledby="trash-view-title">
        <div class="side-section">
          <h2 id="trash-view-title">最近删除</h2>
          <span>{{ store.trash.length }} 篇</span>
        </div>

        <div v-if="store.trash.length" class="trash-list">
          <article v-for="doc in store.trash" :key="doc.id" class="trash-item">
            <div class="trash-copy">
              <div class="trash-title" :title="docTitle(doc.content)">{{ docTitle(doc.content) }}</div>
              <div class="trash-meta">删除于 {{ formatTime(doc.deletedAt) }}</div>
            </div>
            <div class="trash-actions">
              <button class="trash-restore" type="button" @click="restoreDoc(doc.id)">恢复</button>
              <button
                class="trash-purge"
                type="button"
                :aria-label="`彻底删除《${docTitle(doc.content)}》`"
                @click="purgeDoc(doc)"
              >
                彻底删除
              </button>
            </div>
          </article>
        </div>

        <div v-else class="trash-empty">
          <span class="trash-empty-icon" aria-hidden="true">
            <Icon name="trash" :size="24" />
          </span>
          <h3>回收站为空</h3>
          <p>删除的文章会集中显示在这里。</p>
          <button type="button" @click="openDocuments">返回我的文章</button>
        </div>

        <p class="trash-policy">最多保留 10 篇；超过后会自动清除最早删除的文章。</p>
      </section>

      <input ref="importInput" type="file" accept=".md,.markdown,.txt" multiple hidden @change="onImportFiles" />
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import {
  store,
  docTitle,
  notify,
  createDocument,
  selectDocument,
  renameDocument,
  deleteDocument,
  restoreFromTrash,
  removeFromTrash,
  importContents,
  initArchive,
  enableArchive,
  reauthArchive,
} from '../lib/store.js'

const query = ref('')
const menuFor = ref(null)
const importInput = ref(null)
const documentView = computed(() => (store.ui.documentView === 'trash' ? 'trash' : 'documents'))

const visibleDocs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const sorted = [...store.docs].sort((a, b) => b.updatedAt - a.updatedAt)
  if (!q) return sorted
  return sorted.filter((d) => docTitle(d.content).toLowerCase().includes(q))
})

function wordCount(content) {
  return String(content || '').replace(/\s/g, '').length
}

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hhmm}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

function createNew() {
  createDocument()
  notify('已新建文章')
}

function openDocuments() {
  store.ui.documentView = 'documents'
  store.ui.drawerOpen = true
}

function toggleMenu(id) {
  menuFor.value = menuFor.value === id ? null : id
}

function closeMenuOnOutsidePointer(event) {
  if (!menuFor.value) return
  const target = event.target
  if (target instanceof Element && target.closest('.doc-more, .doc-menu')) return
  menuFor.value = null
}

function renameDoc(doc) {
  const current = docTitle(doc.content)
  const next = window.prompt('重命名文章', current)
  menuFor.value = null
  if (next && next.trim() && next.trim() !== current) {
    renameDocument(doc.id, next.trim())
    notify('已重命名')
  }
}

function exportDoc(doc) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }))
  a.download = `${docTitle(doc.content).replace(/[\\/:*?"<>|]/g, '')}.md`
  a.click()
  URL.revokeObjectURL(a.href)
  menuFor.value = null
  notify('已导出 Markdown 文件')
}

function deleteDoc(doc) {
  menuFor.value = null
  if (window.confirm(`删除「${docTitle(doc.content)}」？会移入回收站，可随时恢复。`)) {
    deleteDocument(doc.id)
    notify('已移入回收站')
  }
}

function restoreDoc(id) {
  restoreFromTrash(id)
  openDocuments()
  notify('已从回收站恢复')
}

function purgeDoc(doc) {
  if (window.confirm(`彻底删除「${docTitle(doc.content)}」？此操作无法撤销。`)) {
    removeFromTrash(doc.id)
    notify('已彻底删除')
  }
}

function onImportFiles(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  Promise.all(files.map((f) => f.text().then((content) => ({ name: f.name, content })))).then((list) => {
    const docs = importContents(list)
    notify(docs.length ? `已导入 ${docs.length} 篇文章` : '文件内容为空')
  })
  e.target.value = ''
}

async function enable() {
  try {
    if (await enableArchive()) notify('目录存档已开启，文章将自动同步')
  } catch {
    notify('未选择目录，存档未开启')
  }
}

async function changeDir() {
  await enable()
}

async function reauth() {
  const ok = await reauthArchive()
  notify(ok ? '存档目录已恢复同步' : '授权失败')
}

initArchive()
onMounted(() => document.addEventListener('pointerdown', closeMenuOnOutsidePointer, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeMenuOnOutsidePointer, true))
</script>

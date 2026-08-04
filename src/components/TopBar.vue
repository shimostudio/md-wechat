<template>
  <header class="topbar">
    <div class="tb-logo" aria-hidden="true">排</div>
    <div class="tb-name">字间排版</div>
    <div class="tb-tag">面向公众号写作者的 Markdown 排版工具</div>

    <div class="tb-save" :title="store.lastSavedAt ? '所有文章都会自动保存到「我的文章」' : '编辑后自动保存'">
      <i></i>{{ saveText }}
    </div>

    <div class="spacer"></div>

    <div class="tb-io" ref="ioRef">
      <button
        class="top-btn"
        type="button"
        :aria-expanded="ioOpen"
        aria-haspopup="menu"
        @click="ioOpen = !ioOpen"
      >
        <Icon name="upload" :size="14" aria-hidden="true" /> 导入 / 导出
      </button>
      <div v-if="ioOpen" class="tb-menu" role="menu">
        <button type="button" role="menuitem" @click="act('import')">
          <Icon name="upload" :size="14" aria-hidden="true" /> 导入 Markdown
        </button>
        <button type="button" role="menuitem" @click="act('export')">
          <Icon name="download" :size="14" aria-hidden="true" /> 导出 Markdown
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { store } from '../lib/store.js'

const emit = defineEmits(['import', 'export'])

const ioOpen = ref(false)
const ioRef = ref(null)

function act(name) {
  ioOpen.value = false
  emit(name)
}

function closeOnOutside(event) {
  if (!ioOpen.value) return
  if (event.target instanceof Element && ioRef.value?.contains(event.target)) return
  ioOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside, true))

const saveText = computed(() => {
  if (!store.lastSavedAt) return '本地自动保存已开启'
  const d = new Date(store.lastSavedAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `本地自动保存成功 ${hh}:${mm}:${ss}`
})
</script>

<style scoped>
.tb-io {
  position: relative;
}

.tb-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 168px;
  background: var(--panel, #fff);
  border: 1px solid var(--line, #e3ded0);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(60, 50, 30, 0.12);
  padding: 4px;
  display: flex;
  flex-direction: column;
  z-index: 60;
}

.tb-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  padding: 8px 10px;
  font-size: 12.5px;
  color: inherit;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}

.tb-menu button:hover {
  background: var(--line-2, #f1ede1);
}
</style>

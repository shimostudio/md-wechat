<template>
  <header class="topbar">
    <div class="tb-logo" aria-hidden="true">排</div>
    <div class="tb-name">字间排版</div>
    <div class="tb-tag">面向公众号写作者的 Markdown 排版工具</div>

    <div class="tb-save" :title="store.lastSavedAt ? '所有文章都会自动保存到「我的文章」' : '编辑后自动保存'">
      <i></i>{{ saveText }}
    </div>

    <div class="spacer"></div>

    <button class="top-btn" type="button" @click="$emit('import')">
      <Icon name="upload" :size="14" aria-hidden="true" /> 导入 Markdown
    </button>
    <button class="top-btn" type="button" @click="$emit('export')">
      <Icon name="download" :size="14" aria-hidden="true" /> 导出 Markdown
    </button>
    <button class="top-btn" type="button" @click="$emit('sync-folder')">
      <Icon name="folder" :size="14" aria-hidden="true" /> 同步文件夹
    </button>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { store } from '../lib/store.js'

defineEmits(['import', 'export', 'sync-folder'])

const saveText = computed(() => {
  if (!store.lastSavedAt) return '本地自动保存已开启'
  const d = new Date(store.lastSavedAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `本地自动保存成功 ${hh}:${mm}:${ss}`
})
</script>

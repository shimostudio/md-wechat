<template>
  <header class="topbar">
    <div class="tb-logo" aria-hidden="true">排</div>
    <div class="tb-name">字间排版</div>
    <div class="tb-tag">面向公众号写作者的 Markdown 排版工具</div>

    <div class="tb-save" :title="store.lastSavedAt ? '所有文章都会自动保存到「我的文章」' : '编辑后自动保存'">
      <i></i>{{ saveText }}
    </div>

    <div class="spacer"></div>

    <nav class="tb-social" aria-label="相关链接">
      <a href="https://www.laogou717.com" target="_blank" rel="noopener noreferrer" title="我的博客">
        <Icon name="blog" :size="16" aria-hidden="true" />
      </a>
      <a href="https://github.com/laogou717/md-wechat" target="_blank" rel="noopener noreferrer" title="GitHub 仓库">
        <Icon name="github" :size="16" aria-hidden="true" />
      </a>
      <a href="https://raw.githubusercontent.com/JonasTech0/Jonas-imgs-240211/main/imagesIMG_2767.png" target="_blank" rel="noopener noreferrer" title="请我喝咖啡">
        <Icon name="coffee" :size="16" aria-hidden="true" />
      </a>
      <a href="https://x.com/shenfanlaogou" target="_blank" rel="noopener noreferrer" title="X（Twitter）">
        <Icon name="xlogo" :size="14" aria-hidden="true" />
      </a>
      <a href="https://space.bilibili.com/46377861" target="_blank" rel="noopener noreferrer" title="B站">
        <Icon name="bilibili" :size="16" aria-hidden="true" />
      </a>
    </nav>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { store } from '../lib/store.js'

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
.tb-social {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb-social a {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-2, #6b6b72);
  border-radius: 8px;
  transition: background 0.12s ease, color 0.12s ease;
}

.tb-social a:hover {
  color: var(--ink, #18181b);
  background: var(--line-2, #f1ede1);
}
</style>

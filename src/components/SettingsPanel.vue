<template>
  <aside
    id="settings-panel"
    class="settings-panel"
    :class="{ closed: !store.ui.settingsPanelOpen }"
    :aria-hidden="!store.ui.settingsPanelOpen"
    :inert="!store.ui.settingsPanelOpen"
  >
    <div class="stabs">
      <button class="stab" :class="{ active: tab === 'style' }" type="button" @click="tab = 'style'">样式</button>
      <button class="stab" :class="{ active: tab === 'sticker' }" type="button" @click="tab = 'sticker'">贴纸</button>
      <div class="spacer"></div>
      <button class="panel-x" type="button" title="收起设置" @click="store.ui.settingsPanelOpen = false">
        <Icon name="x" :size="13" aria-hidden="true" />
      </button>
    </div>

    <!-- 样式 Tab -->
    <div v-show="tab === 'style'" class="spanel">
      <div class="s-row">
        <div class="s-label">排版风格</div>
        <div class="s-display">{{ theme.name }}</div>
        <div class="s-hint">主题切换与主题色自定义，统一在左侧 ❖ 主题库中进行</div>
      </div>

      <div class="s-row">
        <div class="s-label">正文字体</div>
        <select v-model="store.settings.fontFamily" class="s-select-input" aria-label="正文字体">
          <option v-for="f in fontOptions" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>

      <div class="s-row">
        <div class="s-label">正文字号</div>
        <div class="s-stepper">
          <button type="button" aria-label="减小字号" @click="stepFontSize(-1)">−</button>
          <b>{{ store.settings.fontSize }}px</b>
          <button type="button" aria-label="增大字号" @click="stepFontSize(1)">＋</button>
          <small>14 – 18px</small>
        </div>
      </div>

      <div class="s-row">
        <div class="s-label">代码块外观</div>
        <div class="s-seg">
          <button type="button" :class="{ active: store.settings.macCode }" @click="store.settings.macCode = true">
            Mac 窗口
          </button>
          <button type="button" :class="{ active: !store.settings.macCode }" @click="store.settings.macCode = false">
            纯代码块
          </button>
        </div>
      </div>

      <div class="s-row">
        <div class="s-label">图库模式</div>
        <div class="s-seg">
          <button
            v-for="mode in galleryModes"
            :key="mode.id"
            type="button"
            :class="{ active: galleryMode === mode.id }"
            :title="mode.hint"
            @click="store.settings.galleryMode = mode.id"
          >
            {{ mode.name }}
          </button>
        </div>
        <div class="s-hint">{{ activeGalleryMode.hint }}</div>
      </div>

      <div class="s-divider"></div>

      <button class="advanced-trigger" type="button" :aria-expanded="customOpen" @click="customOpen = !customOpen">
        <span>
          <strong>逐元素样式微调</strong>
          <small>仅修改「{{ theme.name }}」主题</small>
        </span>
        <Icon name="chevron-down" :size="15" aria-hidden="true" />
      </button>
      <div v-if="customOpen" class="custom-style-content">
        <div class="s-hint">直接编辑元素的内联样式，改完即时生效，复制时一并带走</div>
        <div v-for="el in editableElements" :key="el.key" class="custom-item">
          <div class="custom-name">{{ el.name }}</div>
          <textarea
            rows="2"
            spellcheck="false"
            :value="effectiveStyle(el.key)"
            @input="setCustom(el.key, $event.target.value)"
          ></textarea>
        </div>
        <button class="text-button" type="button" @click="resetCustom">重置「{{ theme.name }}」的全部自定义</button>
      </div>
    </div>

    <!-- 贴纸 Tab -->
    <div v-show="tab === 'sticker'" class="spanel">
      <div class="s-row">
        <div class="s-label">标题贴纸（跟在二级标题后）</div>
        <input
          v-model.trim="store.settings.sticker"
          class="s-select-input"
          type="url"
          inputmode="url"
          placeholder="粘贴图床图片链接"
          aria-label="标题贴纸图片地址"
        />
        <div v-if="store.settings.sticker" class="sticker-preview">
          <span><img :src="store.settings.sticker" alt="当前标题贴纸预览" /></span>
          <button class="text-button" type="button" @click="store.settings.sticker = ''">移除贴纸</button>
        </div>
        <div class="s-hint">只支持公网图片链接；粘贴进公众号时微信会自动转存图片，之后图床失效也不受影响。</div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import { store, theme, activeAccent, activeSlotColors } from '../lib/store.js'
import { fontOptions, buildStyles } from '../lib/themes.js'

const tab = ref('style')
const customOpen = ref(false)

const galleryModes = [
  { id: 'collage', name: '拼贴', hint: '主图更大，适合有视觉重点的组图' },
  { id: 'grid', name: '网格', hint: '所有图片统一尺寸裁切，整齐划一' },
  { id: 'stack', name: '单列', hint: '图片按原始比例纵向排列' },
]
const galleryMode = computed(() => store.settings.galleryMode || 'collage')
const activeGalleryMode = computed(
  () => galleryModes.find((mode) => mode.id === galleryMode.value) || galleryModes[0]
)

const editableElements = [
  { key: 'container', name: '正文容器' },
  { key: 'h1', name: '一级标题' },
  { key: 'h2', name: '二级标题' },
  { key: 'h3', name: '三级标题' },
  { key: 'p', name: '段落' },
  { key: 'blockquote', name: '引用块' },
  { key: 'strong', name: '加粗' },
  { key: 'a', name: '链接' },
  { key: 'code', name: '行内代码' },
  { key: 'img', name: '图片' },
]

const baseStyles = computed(() =>
  buildStyles(theme.value, { ...store.settings, accent: activeAccent.value, slotColors: activeSlotColors.value, custom: undefined })
)

function stepFontSize(delta) {
  const next = (store.settings.fontSize || 16) + delta
  store.settings.fontSize = Math.min(18, Math.max(14, next))
}

function effectiveStyle(key) {
  return (store.settings.custom || {})[theme.value.id]?.[key] ?? baseStyles.value[key] ?? ''
}

function setCustom(key, value) {
  const all = { ...(store.settings.custom || {}) }
  all[theme.value.id] = { ...(all[theme.value.id] || {}), [key]: value }
  store.settings.custom = all
}

function resetCustom() {
  const all = { ...(store.settings.custom || {}) }
  delete all[theme.value.id]
  store.settings.custom = all
}
</script>

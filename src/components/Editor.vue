<template>
  <div ref="el" class="cm-host"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'scrollline'])

const el = ref(null)
let view = null
let scrollRaf = 0
let syncingFromModel = false

// ---- 工具栏命令 ----

const wrapInline = (mark) => {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const before = view.state.sliceDoc(Math.max(0, from - mark.length), from)
  const after = view.state.sliceDoc(to, to + mark.length)
  // 已包裹则取消包裹（开关式）
  if (before === mark && after === mark) {
    view.dispatch({
      changes: [
        { from: from - mark.length, to: from },
        { from: to, to: to + mark.length },
      ],
      selection: { anchor: from - mark.length, head: to - mark.length },
    })
    return
  }
  const text = sel || '文字'
  view.dispatch({
    changes: { from, to, insert: `${mark}${text}${mark}` },
    selection: { anchor: from + mark.length, head: from + mark.length + text.length },
  })
}

const selectedLines = () => {
  const { from, to } = view.state.selection.main
  // 向下选择并停在下一行行首时，不把那一行误算进来。
  const endPos = to > from && view.state.doc.lineAt(to).from === to ? to - 1 : to
  const start = view.state.doc.lineAt(from)
  const end = view.state.doc.lineAt(endPos)
  const lines = []
  for (let number = start.number; number <= end.number; number++) {
    lines.push(view.state.doc.line(number))
  }
  return lines
}

const PREFIX_RULES = {
  h2: {
    target: /^(\s{0,3})##(?:[ \t]+|$)/,
    any: /^(\s{0,3})#{1,6}(?:[ \t]+|$)/,
    prefix: () => '## ',
  },
  h3: {
    target: /^(\s{0,3})###(?:[ \t]+|$)/,
    any: /^(\s{0,3})#{1,6}(?:[ \t]+|$)/,
    prefix: () => '### ',
  },
  quote: {
    target: /^(\s{0,3})>[ \t]?/,
    prefix: () => '> ',
  },
  ul: {
    target: /^(\s*)[-+*][ \t]+/,
    any: /^(\s*)(?:[-+*]|\d+[.)])[ \t]+/,
    prefix: () => '- ',
  },
  ol: {
    target: /^(\s*)\d+[.)][ \t]+/,
    any: /^(\s*)(?:[-+*]|\d+[.)])[ \t]+/,
    prefix: (index) => `${index + 1}. `,
  },
}

const toggleLinePrefix = (kind) => {
  const rule = PREFIX_RULES[kind]
  const lines = selectedLines()
  const remove = lines.every((line) => rule.target.test(line.text))
  const changes = []

  lines.forEach((line, index) => {
    const targetMatch = line.text.match(rule.target)

    if (remove) {
      changes.push({
        from: line.from,
        to: line.from + targetMatch[0].length,
        insert: targetMatch[1] || '',
      })
      return
    }

    // 混合选区中已经是目标格式的行保持不变，防止重复添加前缀。
    if (targetMatch && kind !== 'ol') return

    const anyMatch = rule.any ? line.text.match(rule.any) : null
    if (anyMatch) {
      changes.push({
        from: line.from,
        to: line.from + anyMatch[0].length,
        insert: `${anyMatch[1] || ''}${rule.prefix(index)}`,
      })
      return
    }

    const indent = line.text.match(kind === 'quote' ? /^\s{0,3}/ : /^\s*/)?.[0] || ''
    changes.push({
      from: line.from + indent.length,
      insert: rule.prefix(index),
    })
  })

  if (changes.length) {
    view.dispatch({ changes })
  }
}

const insertBlock = (text) => {
  const { from } = view.state.selection.main
  const insert = `\n\n${text}\n\n`
  view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } })
}

const wrapLink = () => {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to) || '链接文字'
  const insert = `[${sel}](https://)`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + sel.length + 3, head: from + sel.length + 11 },
  })
}

const wrapImage = () => {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to) || '图片描述'
  const insert = `![${sel}](https://)`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + sel.length + 4, head: from + sel.length + 12 },
  })
}

const INLINE = { bold: '**', italic: '*', strike: '~~', inlineCode: '`' }

function exec(cmd) {
  if (!view) return
  if (INLINE[cmd]) wrapInline(INLINE[cmd])
  else if (PREFIX_RULES[cmd]) toggleLinePrefix(cmd)
  else if (cmd === 'link') wrapLink()
  else if (cmd === 'image') wrapImage()
  else if (cmd === 'codeBlock') insertBlock('```js\n\n```')
  else if (cmd === 'table') insertBlock('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |')
  else if (cmd === 'gallery') insertBlock('![图片一](https://)\n\n![图片二](https://)\n\n![图片三](https://)')
  else if (cmd === 'hr') insertBlock('---')
  view.focus()
}

// 把光标送到指定源码行并滚动到可视区域（预览点击定位用）
function scrollToLine(line) {
  if (!view) return
  const lineNumber = Math.min(Math.max(Number(line) + 1, 1), view.state.doc.lines)
  const pos = view.state.doc.line(lineNumber).from
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 14 }),
  })
  view.focus()
}

defineExpose({ exec, scrollToLine })

// ---- 编辑器初始化 ----

onMounted(() => {
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        placeholder('从这里开始，用 Markdown 书写你的文章…'),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !syncingFromModel) {
            emit('update:modelValue', u.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', backgroundColor: '#fdfbf5' },
          '.cm-scroller': {
            fontFamily: "Menlo, Consolas, 'Courier New', monospace",
            lineHeight: '1.75',
          },
          '.cm-gutters': {
            backgroundColor: '#fdfbf5',
            border: 'none',
            color: '#c6c6cf',
            paddingLeft: '4px',
          },
          '.cm-activeLine': { backgroundColor: '#f7f4eb' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8e8e99' },
          '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: '#d7f3e6 !important',
          },
          '.cm-cursor': { borderLeftColor: '#07c160', borderLeftWidth: '2px' },
        }),
      ],
    }),
    parent: el.value,
  })

  // 滚动时向预览同步顶部可见行号（rAF 节流）
  view.scrollDOM.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        if (!view) return
        const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
        emit('scrollline', view.state.doc.lineAt(block.from).number - 1)
      })
    },
    { passive: true }
  )
})

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!view) return
    const next = String(nextValue ?? '')
    if (next === view.state.doc.toString()) return

    const { anchor, head } = view.state.selection.main
    const scrollTop = view.scrollDOM.scrollTop
    syncingFromModel = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: {
          anchor: Math.min(anchor, next.length),
          head: Math.min(head, next.length),
        },
      })
    } finally {
      syncingFromModel = false
    }

    // 全文替换后尽量维持用户所在的阅读位置。
    requestAnimationFrame(() => {
      if (view) view.scrollDOM.scrollTop = scrollTop
    })
  }
)

onBeforeUnmount(() => {
  cancelAnimationFrame(scrollRaf)
  view?.destroy()
  view = null
})
</script>

<style scoped>
.cm-host {
  height: 100%;
}
.cm-host :deep(.cm-editor) {
  height: 100%;
}
.cm-host :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>

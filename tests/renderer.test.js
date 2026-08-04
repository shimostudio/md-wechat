import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, stripPreviewMeta } from '../src/lib/renderer.js'
import { buildStyles, themes } from '../src/lib/themes.js'

const galleryMarkdown = `# 多图测试

![第一张](https://picsum.photos/seed/test-a/800/1000)

![第二张](https://picsum.photos/seed/test-b/1200/800)

![第三张](https://picsum.photos/seed/test-c/800/800)
`

test('所有主题都能渲染完整 Markdown', () => {
  for (const theme of themes) {
    const html = renderMarkdown(galleryMarkdown, theme, {
      fontSize: 16,
      fontFamily: 'sans',
      macCode: true,
      galleryMode: 'collage',
    })
    assert.match(html, /<h1/)
    assert.match(html, /第一张/)
    assert.doesNotMatch(html, /undefined|null/)
  }
})

test('原始 HTML 不会作为可执行标签进入预览', () => {
  const html = renderMarkdown(
    '<img src=x onerror="globalThis.compromised=true">',
    themes[0],
    { galleryMode: 'collage' }
  )
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;img/)
})

test('自定义内联样式不能逃逸成事件属性', () => {
  const html = renderMarkdown('一段正文', themes[0], {
    custom: { p: 'color:red;" onmouseover="globalThis.compromised=true' },
  })
  assert.doesNotMatch(html, /" onmouseover=/)
  assert.match(html, /&quot; onmouseover=/)
})

test('三种多图模式都能生成稳定输出', () => {
  for (const mode of ['collage', 'grid', 'stack']) {
    const html = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: mode })
    assert.match(html, new RegExp(`data-gallery-mode="${mode}"`))
    assert.equal((html.match(/<img/g) || []).length, 3)
  }
})

test('复制前会移除预览专用行号', () => {
  const html = renderMarkdown('# 标题\n\n正文', themes[0], {})
  assert.match(html, /data-line=/)
  assert.doesNotMatch(stripPreviewMeta(html), /data-line=/)
})

test('保留列表起始序号、表格对齐和链接图片 title', () => {
  const html = renderMarkdown(
    `3. 第三项
4. 第四项

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | 42 |

[带提示的链接](https://example.com/ "链接提示")

![带图注的图片](https://picsum.photos/seed/title-test/800/500 "图片提示")`,
    themes[0],
    { galleryMode: 'collage' }
  )

  assert.match(html, /<ol[^>]*start="3"/)
  assert.match(html, /text-align:left/)
  assert.match(html, /text-align:center/)
  assert.match(html, /text-align:right/)
  assert.match(html, /title="链接提示"/)
  assert.match(html, /title="图片提示"/)
})

test('每套新主题都能呈现独立标题、代码外壳与删除线', () => {
  const source = `# 一级标题

## 01 二级标题

##### 五级标题

###### 六级标题

~~已失效内容~~

\`\`\`js
const ready = true
\`\`\``

  const outputs = themes.map((item) =>
    renderMarkdown(source, item, { macCode: true, galleryMode: 'collage' })
  )

  assert.equal(new Set(outputs).size, themes.length)
  for (const html of outputs) {
    assert.match(html, /<h5/)
    assert.match(html, /<h6/)
    assert.match(html, /<s style=/)
    assert.doesNotMatch(html, /undefined|null/)
  }

  assert.match(outputs[1], /CODE \/ JS/)
  assert.match(outputs[2], /TIMECODE \/ JS/)
  assert.match(outputs[3], /background-color:#f2f2f2/)
  assert.match(outputs[4], /CONSOLE \/ JS/)
  assert.match(outputs[5], /TELEMETRY \/ JS/)
})

test('所有主题中的引用列表都保持正确层级与左对齐', () => {
  const source = `> 外层引用
>
> > 内层引用
> >
> > - 引用列表一
> > - 引用列表二`

  for (const theme of themes) {
    const html = renderMarkdown(source, theme, {})

    assert.equal((html.match(/<blockquote/g) || []).length, 2, theme.id)
    assert.equal((html.match(/<li /g) || []).length, 2, theme.id)
    assert.doesNotMatch(html, /<li[^>]*>\s*<p/, `${theme.id} 的紧凑列表不应生成额外段落`)
    assert.match(
      html,
      /<blockquote[^>]*style="[^"]*margin:0\.8em 0 0\.4em[^"]*"/,
      `${theme.id} 的嵌套引用不应重复叠加外层横向边距`
    )
    assert.match(
      html,
      /<ul[^>]*style="[^"]*text-align:left[^"]*text-indent:0[^"]*"/,
      `${theme.id} 的引用列表必须左对齐`
    )
    assert.match(
      html,
      /<li[^>]*style="[^"]*text-align:left[^"]*text-indent:0[^"]*"/,
      `${theme.id} 的列表项必须左对齐`
    )
  }
})

test('嵌套块关闭后的续段仍使用真实祖先样式', () => {
  const source = `- 外层第一段

  - 内层项目

  外层继续段落

> 引用第一段
>
> > 内层引用
>
> 引用继续段落`
  const html = renderMarkdown(source, themes[0], {
    custom: {
      p: '--paragraph-role:normal;',
      liP: '--paragraph-role:list;',
      bqP: '--paragraph-role:quote;',
    },
  })

  assert.match(html, /style="--paragraph-role:list;[^"]*">外层继续段落/)
  assert.match(html, /style="--paragraph-role:quote;[^"]*">引用继续段落/)
  assert.doesNotMatch(html, /style="--paragraph-role:normal;">(?:外层|引用)继续段落/)
})

test('所有主题都保护长英文断行，纸上散文不再拉散中文字距', () => {
  const source =
    '这里放入一个很长的英文词：supercalifragilisticexpialidociousAndAnotherUnbrokenTokenForOverflowTesting。'

  for (const theme of themes) {
    const styles = buildStyles(theme)
    const html = renderMarkdown(source, theme, {})

    assert.match(styles.container, /overflow-wrap:anywhere/, theme.id)
    assert.match(html, /supercalifragilisticexpialidociousAndAnotherUnbrokenTokenForOverflowTesting/)
  }

  const literaryStyles = buildStyles(themes[0])
  assert.match(literaryStyles.p, /text-align:left/)
  assert.doesNotMatch(literaryStyles.p, /text-align:justify/)
})

test('辅色槽位可独立覆盖，未指定的槽位与主色不受影响', () => {
  const candy = themes.find((t) => t.id === 'candy-pop')
  const source = '> 引用\n\n[链接](https://example.com)\n\n==高亮=='

  const original = renderMarkdown(source, candy, { fontSize: 16 })
  assert.match(original, /#4d7cff/i)

  const recolored = renderMarkdown(source, candy, {
    fontSize: 16,
    slotColors: { blue: '#00c853' },
  })
  assert.match(recolored, /#00c853/i)
  assert.doesNotMatch(recolored, /#4d7cff/i)
  // 浅蓝底随之派生，不再出现原浅底
  assert.doesNotMatch(recolored, /#f4f8ff/i)
  // 未调整的黄色槽位保持原样
  assert.match(recolored, /#ffd23f/i)

  // 鎏金的深色变体按所选颜色派生
  const gold = themes.find((t) => t.id === 'midnight-gold')
  const regolded = renderMarkdown('**重点** 与 ==高亮==', gold, {
    fontSize: 16,
    slotColors: { gold: '#2f6b4f' },
  })
  assert.match(regolded, /#2f6b4f/i)
  assert.doesNotMatch(regolded, /#c9a063/i)
  assert.doesNotMatch(regolded, /#8a6d2f/i)
  assert.doesNotMatch(regolded, /#f4ecd9/i)
})

test('视频写法渲染为占位卡片，普通 iframe 与句中链接不受影响', () => {
  const tag = renderMarkdown('<video src="https://example.com/a.mp4"></video>', themes[0], {})
  assert.match(tag, /视频占位/)
  assert.match(tag, /https:\/\/example\.com\/a\.mp4/)
  assert.doesNotMatch(tag, /<video/i)

  const bare = renderMarkdown('https://example.com/b.mp4', themes[0], {})
  assert.match(bare, /视频占位/)

  const iframe = renderMarkdown('<iframe src="https://v.qq.com/x.html"></iframe>', themes[0], {})
  assert.match(iframe, /视频占位/)

  const otherIframe = renderMarkdown('<iframe src="https://example.com/widget"></iframe>', themes[0], {})
  assert.doesNotMatch(otherIframe, /视频占位/)

  const inline = renderMarkdown('这个地址 https://example.com/c.mp4 写在句子里', themes[0], {})
  assert.doesNotMatch(inline, /视频占位/)
})

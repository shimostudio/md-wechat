// 图床供应商：可选的图片/视频公网托管。
// 每个供应商实现一个 upload(blob, config, filename) → 公网 URL。
// 凭据只存用户本机浏览器，不经过任何第三方中转。

// 从响应 JSON 里按 "a.b.c" 路径取值
export function extractUrl(data, path) {
  let value = data
  for (const key of String(path || 'url').split('.')) value = value?.[key]
  return typeof value === 'string' && value.startsWith('http') ? value : null
}

export const IMAGE_HOSTS = [
  {
    id: 'smms',
    name: 'SM.MS',
    fields: [{ key: 'token', label: 'Token', secret: true, placeholder: 'SM.MS 的 API Token' }],
    async upload(blob, config, filename) {
      const form = new FormData()
      form.append('smfile', blob, filename)
      const res = await fetch('https://smms.app/api/v2/upload', {
        method: 'POST',
        headers: { Authorization: config.token },
        body: form,
      })
      const data = await res.json()
      if (data.success) return data.data.url
      if (data.code === 'image_repeated' && data.images) return data.images
      throw new Error(data.message || 'SM.MS 上传失败')
    },
  },
  {
    id: 'custom',
    name: '自定义接口',
    fields: [
      { key: 'endpoint', label: '接口地址', placeholder: 'https://example.com/api/upload' },
      { key: 'token', label: 'Token（可选）', secret: true, placeholder: 'Bearer Token，可留空' },
      { key: 'field', label: '文件字段名', placeholder: '默认 file' },
      { key: 'urlPath', label: '返回 URL 字段', placeholder: '默认 url；嵌套写法如 data.url' },
    ],
    async upload(blob, config, filename) {
      if (!config.endpoint) throw new Error('未填写接口地址')
      const form = new FormData()
      form.append(config.field || 'file', blob, filename)
      const headers = {}
      if (config.token) {
        headers.Authorization = /^Bearer /i.test(config.token) ? config.token : `Bearer ${config.token}`
      }
      const res = await fetch(config.endpoint, { method: 'POST', headers, body: form })
      if (!res.ok) throw new Error(`接口返回 HTTP ${res.status}`)
      const url = extractUrl(await res.json(), config.urlPath || 'url')
      if (!url) throw new Error('响应中未找到图片 URL，请检查「返回 URL 字段」')
      return url
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    fields: [
      { key: 'repo', label: '仓库', placeholder: '如 laogou717/imgs' },
      { key: 'token', label: 'Token', secret: true, placeholder: '含 repo 权限的 Personal Access Token' },
      { key: 'branch', label: '分支（可选）', placeholder: '默认 main' },
    ],
    async upload(blob, config, filename) {
      if (!config.repo || !config.token) throw new Error('未填写仓库或 Token')
      const branch = config.branch || 'main'
      const path = `uploads/${Date.now()}-${filename}`
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (const b of bytes) bin += String.fromCharCode(b)
      const res = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `upload ${filename}`, content: btoa(bin), branch }),
      })
      if (!res.ok) throw new Error(`GitHub 返回 HTTP ${res.status}`)
      return `https://cdn.jsdelivr.net/gh/${config.repo}@${branch}/${path}`
    },
  },
]

export function getImageHost(id) {
  return IMAGE_HOSTS.find((h) => h.id === id) || null
}

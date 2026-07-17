const safeJsonParse = (text) => {
  if (!text?.trim()) return null
  return JSON.parse(text.replace(/":\s*(\d{16,})/g, '":"$1"'))
}

const getToken = () => localStorage.getItem('token') || ''

/**
 * 后端基地址。参考 ruoyi-web 的做法：dev 阶段让浏览器直连后端，
 * 不经 Vite proxy —— 否则 SSE 流式连接会被 proxy 缓冲/截断，一建立就断。
 * 用当前访问主机名 + 后端端口动态拼接，保证与前端同 host，避免跨域。
 * VITE_API_TARGET 若是绝对地址则直接用，否则取其端口。
 */
function resolveApiBase() {
  const target = (import.meta.env.VITE_API_TARGET || '').trim()
  if (/^https?:\/\//.test(target)) return target.replace(/\/$/, '')
  // target 形如 localhost:6039 或 :6039，取端口
  const port = (target.match(/:(\d+)/) || [])[1] || '6039'
  return `${location.protocol}//${location.hostname}:${port}`
}
const API_BASE = resolveApiBase()

/** 集中管理鉴权头；第一阶段免鉴权，token 为空时返回 {} */
const authHeader = () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {})

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  const token = getToken()

  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...options, headers })
  const payload = safeJsonParse(await response.text())
  if (!response.ok || (typeof payload?.code === 'number' && payload.code !== 200)) {
    const error = new Error(payload?.msg || payload?.message || `请求失败 (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload?.data ?? payload
}

export const authApi = {
  login: (username, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
}

export const conversationApi = {
  list: (page = 1, size = 50) => request(`/api/chat/conversations?page=${page}&size=${size}`),
  create: (modelConfigId) => request('/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ modelConfigId: modelConfigId ? String(modelConfigId) : undefined }),
  }),
  messages: (id) => request(`/api/chat/conversations/${id}/messages`),
}

export const modelApi = {
  list: () => request('/api/model/list?buildMode=true'),
}

export const workspaceApi = {
  files: () => request('/api/files/workspace'),
}

export async function streamChat(payload, { signal, onEvent }) {
  return streamSse('/api/chat', payload, { signal, onEvent })
}

/**
 * 编程能力流式接口：对接 ruoyi-ai 的 POST /coding/chat。
 * 复用与 streamChat 相同的 SSE 解析逻辑。
 *
 * @param {Object} payload - { prompt, model, workspacePath }
 * @param {Object} options - { signal, onEvent }
 */
export async function streamCoding(payload, { signal, onEvent }) {
  return streamSse(`${API_BASE}/coding/chat`, payload, { signal, onEvent })
}

/**
 * 通用 SSE 请求：POST endpoint，逐块解析 event:/data: 行，回调 onEvent。
 */
async function streamSse(path, payload, { signal, onEvent }) {
  let response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error(`连接后端失败：${e.message}（确认 ruoyi-ai 已启动在 ${path}）`)
  }

  if (!response.ok || !response.body) {
    throw new Error(`消息发送失败 (${response.status} ${response.statusText})`)
  }

  // 诊断：确认 SSE 响应头被代理正确透传
  // eslint-disable-next-line no-console
  console.info('[streamSse] response ct =', response.headers.get('content-type'))

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let receivedAny = false

  const dispatchBlock = (block) => {
    let eventName = 'message'
    const dataLines = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return
    receivedAny = true
    const rawData = dataLines.join('\n')
    // eslint-disable-next-line no-console
    console.info('[streamSse] dispatch', eventName, 'len=', rawData.length)
    if (rawData === '[DONE]') {
      onEvent({ type: 'complete' })
      return
    }
    try {
      onEvent({ type: eventName, payload: safeJsonParse(rawData) })
    } catch {
      onEvent({ type: eventName, payload: rawData })
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      // eslint-disable-next-line no-console
      console.info('[streamSse] chunk bytes=', value?.length, 'done=', done)
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      blocks.forEach(dispatchBlock)
      if (done) break
    }
    if (buffer.trim()) dispatchBlock(buffer)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // 流读取中途断开：Vite proxy 缓冲 / 客户端网络中断 / 后端 emitter 提前关闭都会进这里
    throw new Error(`流式连接中断：${e.message}${receivedAny ? '' : '（未收到任何事件，可能是代理未透传 SSE）'}`)
  }
}

/**
 * 编程能力 API
 */
export const codingApi = {
  chat: (prompt, model, workspacePath, options) =>
    streamCoding({
      prompt,
      model,
      workspacePath: workspacePath || undefined,
    }, options),
  workspace: (workspacePath) => request(`${API_BASE}/coding/workspace${workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : ''}`),
  models: () => request(`${API_BASE}/coding/models`),
  readFile: (path, workspacePath) => request(`${API_BASE}/coding/file?path=${encodeURIComponent(path)}${workspacePath ? `&workspacePath=${encodeURIComponent(workspacePath)}` : ''}`),
  saveFile: (path, content, workspacePath) => request(`${API_BASE}/coding/file`, {
    method: 'PUT',
    body: JSON.stringify({ path, content, workspacePath: workspacePath || undefined }),
  }),
  command: (command, workspacePath) => request(`${API_BASE}/coding/command`, {
    method: 'POST',
    body: JSON.stringify({ command, workspacePath: workspacePath || undefined }),
  }),
}

const safeJsonParse = (text) => {
  if (!text?.trim()) return null
  return JSON.parse(text.replace(/":\s*(\d{16,})/g, '":"$1"'))
}

const getToken = () => localStorage.getItem('token') || ''

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
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`消息发送失败 (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchBlock = (block) => {
    let eventName = 'message'
    const dataLines = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return
    const rawData = dataLines.join('\n')
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

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(dispatchBlock)
    if (done) break
  }
  if (buffer.trim()) dispatchBlock(buffer)
}

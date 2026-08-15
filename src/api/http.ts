interface ApiEnvelope<T> {
  code?: number
  msg?: string
  message?: string
  data?: T
}

const AUTH_TOKEN_KEY = 'token'

export const AUTH_REQUIRED_EVENT = 'ruoyi-copilot:auth-required'

export class ApiError extends Error {
  readonly status: number
  readonly code?: number

  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function getAuthToken(): string {
  return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? ''
}

export function setAuthToken(token: string): void {
  globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY)
}

export function notifyAuthRequired(): void {
  clearAuthToken()
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.Event === 'function') {
    globalThis.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
  }
}

export function resolveApiUrl(path: string): string {
  const target = (import.meta.env.VITE_API_TARGET ?? '').trim()
  if (/^https?:\/\//i.test(target)) {
    return new URL(path, `${target.replace(/\/$/, '')}/`).toString()
  }
  return path
}

export function createHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const clientId = import.meta.env.VITE_CLIENT_ID?.trim()
  if (clientId) headers.set('ClientID', clientId)
  return headers
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === 'object' && value !== null
    && ('code' in value || 'data' in value || 'msg' in value)
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = createHeaders(options.headers)
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(resolveApiUrl(path), { ...options, headers })
  const raw = await response.text()
  let payload: unknown = null
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as unknown
    } catch {
      throw new ApiError(`服务返回了无法解析的响应 (${response.status})`, response.status)
    }
  }
  const envelope = isEnvelope(payload) ? payload : undefined
  const businessFailed = typeof envelope?.code === 'number' && envelope.code !== 200
  if (!response.ok || businessFailed) {
    if (response.status === 401 || envelope?.code === 401) notifyAuthRequired()
    const message = envelope?.msg ?? envelope?.message
      ?? `请求失败 (${response.status} ${response.statusText})`
    throw new ApiError(message, response.status, envelope?.code)
  }
  return (envelope && 'data' in envelope ? envelope.data : payload) as T
}

import { createHeaders, notifyAuthRequired, resolveApiUrl } from './http'
import type { HarnessEvent } from '../types/harness'

export interface SseFrame {
  id?: string
  event: string
  data: string
  retry?: number
}

export class HarnessSseProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessSseProtocolError'
  }
}

class NonRetryableStreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableStreamError'
  }
}

export class SseFrameDecoder {
  private buffer = ''

  push(chunk: string, final = false): SseFrame[] {
    this.buffer += chunk
    const frames: SseFrame[] = []
    const blocks = this.buffer.split(/\r?\n\r?\n/)
    this.buffer = blocks.pop() ?? ''
    if (this.buffer.length > 4 * 1024 * 1024
      || blocks.some((block) => block.length > 4 * 1024 * 1024)) {
      this.buffer = ''
      throw new HarnessSseProtocolError('SSE 事件帧超过 4 MiB 安全上限')
    }
    for (const block of blocks) {
      const frame = parseFrame(block)
      if (frame) frames.push(frame)
    }
    if (final && this.buffer.trim()) {
      const frame = parseFrame(this.buffer)
      this.buffer = ''
      if (frame) frames.push(frame)
    }
    return frames
  }
}

function parseFrame(block: string): SseFrame | null {
  let event = 'message'
  let id: string | undefined
  let retry: number | undefined
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    let value = separator < 0 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value || 'message'
    if (field === 'id' && !value.includes('\0')) id = value
    if (field === 'data') data.push(value)
    if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value)
  }
  if (!data.length) return null
  return { id, event, data: data.join('\n'), retry }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readErrorPayload(response: Response): Promise<{ code?: number, message?: string }> {
  const payload = await response.clone().json().catch(() => null) as unknown
  if (!isRecord(payload)) return {}
  const rawCode = payload.code
  const code = typeof rawCode === 'number' ? rawCode
    : typeof rawCode === 'string' && /^\d+$/.test(rawCode) ? Number(rawCode) : undefined
  const rawMessage = payload.msg ?? payload.message
  return { code, message: typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : undefined }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new HarnessSseProtocolError(`SSE 事件缺少 ${field}`)
  return value
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function numberValue(value: unknown, fallback?: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (fallback && /^\d+$/.test(fallback)) return Number(fallback)
  throw new HarnessSseProtocolError('SSE 事件缺少有效 sequence')
}

/**
 * Maps the transport envelope to the durable event without introducing another `data` wrapper.
 * The payload identity is checked against the selected run so a delayed stream cannot corrupt it.
 */
export function normalizeHarnessSseEvent(
  frame: SseFrame,
  expected: { sessionId: string; runId: string },
): HarnessEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(frame.data) as unknown
  } catch {
    throw new HarnessSseProtocolError(`无法解析 ${frame.event} SSE 事件`)
  }
  if (!isRecord(parsed)) throw new HarnessSseProtocolError('SSE 事件必须是对象')
  const sessionId = requiredString(parsed.sessionId, 'sessionId')
  const runId = requiredString(parsed.runId, 'runId')
  if (sessionId !== expected.sessionId || runId !== expected.runId) {
    throw new HarnessSseProtocolError('SSE 事件与当前会话或运行不匹配')
  }
  const data = isRecord(parsed.data) ? parsed.data : {}
  const sequence = numberValue(parsed.sequence, frame.id)
  if (frame.id && /^\d+$/.test(frame.id) && Number(frame.id) !== sequence) {
    throw new HarnessSseProtocolError('SSE 外层 id 与事件 sequence 不匹配')
  }
  const type = typeof parsed.type === 'string' && parsed.type ? parsed.type : frame.event
  if (frame.event !== 'message' && frame.event !== type) {
    throw new HarnessSseProtocolError('SSE 外层 event 与事件 type 不匹配')
  }
  return {
    schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
    eventId: requiredString(parsed.eventId, 'eventId'),
    sessionId,
    runId,
    sequence,
    timestamp: numberValue(parsed.timestamp),
    type,
    stepId: optionalString(parsed.stepId),
    toolCallId: optionalString(parsed.toolCallId),
    approvalId: optionalString(parsed.approvalId),
    data,
  }
}

export interface HarnessEventStreamOptions {
  sessionId: string
  runId: string
  afterSequence?: number
  signal: AbortSignal
  onEvent: (event: HarnessEvent) => void | Promise<void>
  onConnectionChange?: (state: 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED') => void
  fetchImpl?: typeof fetch
  initialRetryMillis?: number
  maxRetryMillis?: number
}

const terminalEvents = new Set(['run.completed', 'run.failed', 'run.cancelled'])

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError')
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timeout)
      reject(abortError())
    }
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function streamHarnessEvents(options: HarnessEventStreamOptions): Promise<number> {
  const fetchImpl = options.fetchImpl ?? fetch
  let cursor = Math.max(0, options.afterSequence ?? 0)
  let retryMillis = Math.max(10, options.initialRetryMillis ?? 500)
  const maxRetryMillis = Math.max(retryMillis, options.maxRetryMillis ?? 8_000)
  let firstAttempt = true

  while (!options.signal.aborted) {
    options.onConnectionChange?.(firstAttempt ? 'CONNECTING' : 'RECONNECTING')
    const query = new URLSearchParams({ afterSequence: String(cursor) })
    const url = resolveApiUrl(`/coding/harness/sessions/${encodeURIComponent(options.sessionId)}`
      + `/runs/${encodeURIComponent(options.runId)}/events/stream?${query}`)
    const headers = createHeaders({ Accept: 'text/event-stream' })
    if (cursor > 0) headers.set('Last-Event-ID', String(cursor))

    try {
      const response = await fetchImpl(url, { method: 'GET', headers, signal: options.signal })
      if (!response.ok || !response.body) {
        const payload = await readErrorPayload(response)
        if (response.status === 401 || payload.code === 401) notifyAuthRequired()
        const message = payload.message
          ?? `事件流连接失败 (${response.status} ${response.statusText})`
        if (response.status >= 400 && response.status < 500
          && response.status !== 408 && response.status !== 429) {
          throw new NonRetryableStreamError(message)
        }
        throw new Error(message)
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.includes('text/event-stream')) {
        const payload = await readErrorPayload(response)
        if (payload.code === 401) notifyAuthRequired()
        throw new NonRetryableStreamError(payload.message
          ?? `事件流返回了错误的 Content-Type: ${contentType || 'missing'}`)
      }
      options.onConnectionChange?.('OPEN')
      firstAttempt = false
      retryMillis = Math.max(10, options.initialRetryMillis ?? 500)
      const reader = response.body.getReader()
      const textDecoder = new TextDecoder()
      const decoder = new SseFrameDecoder()
      let terminal = false
      while (!terminal) {
        const { done, value } = await reader.read()
        const frames = decoder.push(textDecoder.decode(value ?? new Uint8Array(), { stream: !done }), done)
        for (const frame of frames) {
          if (frame.retry !== undefined) {
            retryMillis = Math.max(10, Math.min(frame.retry, maxRetryMillis))
          }
          const event = normalizeHarnessSseEvent(frame, options)
          if (event.sequence <= cursor) continue
          await options.onEvent(event)
          cursor = event.sequence
          terminal = terminalEvents.has(event.type)
          if (terminal) break
        }
        if (done) break
      }
      reader.releaseLock()
      if (terminal) {
        options.onConnectionChange?.('CLOSED')
        return cursor
      }
    } catch (error) {
      if (options.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        options.onConnectionChange?.('CLOSED')
        throw abortError()
      }
      if (error instanceof NonRetryableStreamError || error instanceof HarnessSseProtocolError) {
        options.onConnectionChange?.('CLOSED')
        throw error
      }
    }

    await wait(retryMillis, options.signal)
    retryMillis = Math.min(retryMillis * 2, maxRetryMillis)
  }
  options.onConnectionChange?.('CLOSED')
  throw abortError()
}

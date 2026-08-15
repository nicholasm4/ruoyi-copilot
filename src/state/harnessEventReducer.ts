import type { HarnessEvent, HarnessRunStatus, PlanIdentity } from '../types/harness'

export interface StreamingAssistantTurn {
  effectId: string
  text: string
  thinking: string
  completed: boolean
}

export interface ToolActivity {
  toolCallId: string
  toolName: string
  arguments?: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  code?: string
}

export interface HarnessEventProjection {
  lastSequence: number
  events: readonly HarnessEvent[]
  streamingTurn: StreamingAssistantTurn | null
  tools: Readonly<Record<string, ToolActivity>>
  planIdentity: PlanIdentity | null
  status: HarnessRunStatus | null
}

const visibleEventLimit = 250

export function emptyHarnessProjection(): HarnessEventProjection {
  return {
    lastSequence: 0,
    events: [],
    streamingTurn: null,
    tools: {},
    planIdentity: null,
    status: null,
  }
}

function stringData(event: HarnessEvent, key: string): string | undefined {
  const value = event.data[key]
  return typeof value === 'string' ? value : undefined
}

function numberData(event: HarnessEvent, key: string): number | undefined {
  const value = event.data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function runStatus(value: unknown): HarnessRunStatus | null {
  const statuses: HarnessRunStatus[] = [
    'QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT',
    'SUSPENDED', 'COMPLETED', 'FAILED', 'CANCELLED',
  ]
  return typeof value === 'string' && statuses.includes(value as HarnessRunStatus)
    ? value as HarnessRunStatus : null
}

export function reduceHarnessEvent(
  current: HarnessEventProjection,
  event: HarnessEvent,
): HarnessEventProjection {
  if (event.sequence <= current.lastSequence) return current
  let streamingTurn = current.streamingTurn
  let tools = current.tools
  let planIdentity = current.planIdentity
  const effectId = stringData(event, 'effectId')

  if ((event.type === 'assistant.text.delta' || event.type === 'assistant.thinking.delta') && effectId) {
    const existing = streamingTurn?.effectId === effectId
      ? streamingTurn
      : { effectId, text: '', thinking: '', completed: false }
    const delta = stringData(event, 'delta') ?? ''
    streamingTurn = event.type === 'assistant.text.delta'
      ? { ...existing, text: existing.text + delta }
      : { ...existing, thinking: existing.thinking + delta }
  }

  if (event.type === 'assistant.completed' && streamingTurn) {
    streamingTurn = { ...streamingTurn, completed: true }
  }

  if (event.type === 'assistant.tool.complete' && event.toolCallId) {
    tools = {
      ...tools,
      [event.toolCallId]: {
        toolCallId: event.toolCallId,
        toolName: stringData(event, 'name') ?? 'unknown_tool',
        arguments: stringData(event, 'arguments'),
        status: 'RUNNING',
      },
    }
  }

  if (event.type === 'tool.completed' && event.toolCallId) {
    const existing = tools[event.toolCallId]
    const failed = event.data.error === true
    tools = {
      ...tools,
      [event.toolCallId]: {
        toolCallId: event.toolCallId,
        toolName: existing?.toolName ?? 'unknown_tool',
        arguments: existing?.arguments,
        status: failed ? 'FAILED' : 'COMPLETED',
        code: stringData(event, 'code'),
      },
    }
  }

  if (event.type.startsWith('plan.')) {
    const taskId = stringData(event, 'taskId')
    const revision = numberData(event, 'revision')
    const hash = stringData(event, 'hash')
    if (taskId && revision !== undefined && hash) planIdentity = { taskId, revision, hash }
  }

  return {
    lastSequence: event.sequence,
    events: [...current.events.slice(-(visibleEventLimit - 1)), event],
    streamingTurn,
    tools,
    planIdentity,
    status: runStatus(event.data.status) ?? current.status,
  }
}

export function reduceHarnessEvents(events: readonly HarnessEvent[]): HarnessEventProjection {
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .reduce(reduceHarnessEvent, emptyHarnessProjection())
}

export function acknowledgeStreamingTurn(current: HarnessEventProjection): HarnessEventProjection {
  if (!current.streamingTurn?.completed) return current
  return { ...current, streamingTurn: null }
}

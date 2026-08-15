import {
  computed,
  onScopeDispose,
  reactive,
  readonly,
  shallowRef,
} from 'vue'
import { harnessApi } from '../api/harnessApi'
import { streamHarnessEvents } from '../api/harnessSse'
import {
  acknowledgeStreamingTurn,
  emptyHarnessProjection,
  reduceHarnessEvent,
} from '../state/harnessEventReducer'
import { createId } from '../utils/id'
import type {
  ApprovalDecision,
  HarnessApprovalPolicy,
  HarnessEvent,
  HarnessInputKind,
  HarnessMessage,
  HarnessPermissionMode,
  HarnessRunState,
  HarnessSessionState,
  ModelOption,
  PlanIdentity,
} from '../types/harness'

type ConnectionState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED'

interface HarnessSettings {
  workspacePath: string
  model: string
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
}

const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

function messageText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function latestRun(runs: HarnessRunState[], preferredId: string | null): HarnessRunState | null {
  if (preferredId) {
    const preferred = runs.find((run) => run.runId === preferredId)
    if (preferred) return preferred
  }
  return [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
}

async function readEventProjection(sessionId: string, runId: string) {
  let projection = emptyHarnessProjection()
  let cursor = 0
  while (true) {
    const page = await harnessApi.events(sessionId, runId, cursor, 10_000)
    projection = page.reduce(reduceHarnessEvent, projection)
    if (page.length < 10_000) return projection
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return projection
    cursor = next
  }
}

async function readRecentMessages(sessionId: string): Promise<HarnessMessage[]> {
  const visibleLimit = 2_000
  let result: HarnessMessage[] = []
  let cursor = 0
  while (true) {
    const page = await harnessApi.messages(sessionId, cursor, 10_000)
    result = [...result, ...page].slice(-visibleLimit)
    if (page.length < 10_000) return result
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return result
    cursor = next
  }
}

async function readMessagesAfter(sessionId: string, afterSequence: number): Promise<HarnessMessage[]> {
  const result: HarnessMessage[] = []
  let cursor = afterSequence
  while (true) {
    const page = await harnessApi.messages(sessionId, cursor, 10_000)
    result.push(...page)
    if (page.length < 10_000) return result
    const next = page.at(-1)?.sequence ?? cursor
    if (next <= cursor) return result
    cursor = next
  }
}

export function useHarnessAgent() {
  const storedPermission = globalThis.localStorage?.getItem('harness.permission')
  const storedApproval = globalThis.localStorage?.getItem('harness.approval')
  const storedPermissionMode = (storedPermission as HarnessPermissionMode | null) ?? 'WORKSPACE_WRITE'
  const storedApprovalPolicy = (storedApproval as HarnessApprovalPolicy | null)
    ?? (storedPermissionMode === 'FULL_ACCESS' ? 'NEVER' : 'ON_REQUEST')
  const _sessions = shallowRef<HarnessSessionState[]>([])
  const _models = shallowRef<ModelOption[]>([])
  const _activeSession = shallowRef<HarnessSessionState | null>(null)
  const _activeRun = shallowRef<HarnessRunState | null>(null)
  const _messages = shallowRef<HarnessMessage[]>([])
  const _projection = shallowRef(emptyHarnessProjection())
  const _loading = shallowRef(false)
  const _submitting = shallowRef(false)
  const _error = shallowRef('')
  const _connection = shallowRef<ConnectionState>('IDLE')
  const settings = reactive<HarnessSettings>({
    workspacePath: globalThis.localStorage?.getItem('harness.workspace') ?? '',
    model: globalThis.localStorage?.getItem('harness.model') ?? '',
    permissionMode: storedPermissionMode,
    approvalPolicy: storedApprovalPolicy,
  })

  let selectionRevision = 0
  let streamAbort: AbortController | null = null
  let pendingSessionCreate: { fingerprint: string; key: string } | null = null
  let pendingRunCreate: { fingerprint: string; key: string } | null = null
  const pendingQueuedInputs = new Map<string, string>()
  const pendingApprovalDecisions = new Map<string, { fingerprint: string; key: string }>()
  let pendingPlanFeedback: { fingerprint: string; key: string } | null = null

  const planIdentity = computed<PlanIdentity | null>(() => {
    const plan = _activeRun.value?.executionPlan
    if (!plan) return null
    if (typeof plan.canonicalHash === 'string' && /^[a-f0-9]{64}$/.test(plan.canonicalHash)) {
      return { taskId: plan.taskId, revision: plan.revision, hash: plan.canonicalHash }
    }
    const fromEvent = _projection.value.planIdentity
    return fromEvent?.taskId === plan.taskId && fromEvent.revision === plan.revision
      ? fromEvent : null
  })
  const pendingApprovals = computed(() => {
    const run = _activeRun.value
    if (!run) return []
    return Object.values(run.toolApprovals ?? {})
      .filter((approval) => approval.state === 'PENDING')
      .sort((left, right) => left.createdAt - right.createdAt)
  })
  const canCancel = computed(() => Boolean(_activeRun.value && !terminalStatuses.has(_activeRun.value.status)))
  const canResume = computed(() => _activeRun.value?.status === 'SUSPENDED')

  function rememberSettings(): void {
    globalThis.localStorage?.setItem('harness.workspace', settings.workspacePath)
    globalThis.localStorage?.setItem('harness.model', settings.model)
    globalThis.localStorage?.setItem('harness.permission', settings.permissionMode)
    globalThis.localStorage?.setItem('harness.approval', settings.approvalPolicy)
  }

  function setWorkspacePath(value: string): void {
    settings.workspacePath = value
    rememberSettings()
  }

  function setModel(value: string): void {
    settings.model = value
    rememberSettings()
  }

  function setPermissionMode(value: HarnessPermissionMode): void {
    settings.permissionMode = value
    rememberSettings()
  }

  function setApprovalPolicy(value: HarnessApprovalPolicy): void {
    settings.approvalPolicy = value
    rememberSettings()
  }

  function stopStream(): void {
    streamAbort?.abort()
    streamAbort = null
    _connection.value = 'CLOSED'
  }

  function setFailure(error: unknown): void {
    _error.value = messageText(error)
  }

  function clearError(): void {
    _error.value = ''
  }

  async function refreshMessages(sessionId: string, revision: number): Promise<void> {
    const cursor = _messages.value.at(-1)?.sequence ?? 0
    const messages = await readMessagesAfter(sessionId, cursor)
    if (selectionRevision !== revision || _activeSession.value?.sessionId !== sessionId) return
    if (messages.length) {
      _messages.value = [..._messages.value, ...messages].slice(-2_000)
    }
    _projection.value = acknowledgeStreamingTurn(_projection.value)
  }

  async function refreshRun(sessionId: string, runId: string, revision: number): Promise<void> {
    const run = await harnessApi.getRun(sessionId, runId)
    if (selectionRevision !== revision || _activeRun.value?.runId !== runId) return
    _activeRun.value = run
    _sessions.value = _sessions.value.map((session) => session.sessionId === sessionId
      ? { ...session, activeRunId: runId, updatedAt: Math.max(session.updatedAt, run.updatedAt) }
      : session)
  }

  async function handleEvent(event: HarnessEvent, revision: number): Promise<void> {
    if (selectionRevision !== revision || _activeRun.value?.runId !== event.runId) return
    _projection.value = reduceHarnessEvent(_projection.value, event)
    const refreshRunTypes = event.type.startsWith('run.')
      || event.type.startsWith('approval.')
      || event.type.startsWith('plan.')
    const refreshMessageTypes = event.type === 'assistant.completed'
      || event.type === 'tool.completed'
      || event.type === 'input.queued'
      || event.type === 'run.completed'
      || event.type === 'run.failed'
      || event.type === 'run.cancelled'
    const operations: Promise<void>[] = []
    if (refreshRunTypes) operations.push(refreshRun(event.sessionId, event.runId, revision))
    if (refreshMessageTypes) operations.push(refreshMessages(event.sessionId, revision))
    if (operations.length) {
      await Promise.allSettled(operations)
    }
  }

  function connectStream(run: HarnessRunState, cursor: number, revision: number): void {
    stopStream()
    if (terminalStatuses.has(run.status)) {
      _connection.value = 'CLOSED'
      return
    }
    const controller = new AbortController()
    streamAbort = controller
    void streamHarnessEvents({
      sessionId: run.sessionId,
      runId: run.runId,
      afterSequence: cursor,
      signal: controller.signal,
      onConnectionChange(state) {
        if (selectionRevision === revision) _connection.value = state
      },
      onEvent: (event) => handleEvent(event, revision),
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (selectionRevision === revision) setFailure(error)
    })
  }

  async function activateRun(run: HarnessRunState, revision: number): Promise<void> {
    _activeRun.value = run
    const [messages, events] = await Promise.all([
      readRecentMessages(run.sessionId),
      readEventProjection(run.sessionId, run.runId),
    ])
    if (selectionRevision !== revision || _activeRun.value?.runId !== run.runId) return
    _messages.value = messages
    _projection.value = acknowledgeStreamingTurn(events)
    connectStream(run, _projection.value.lastSequence, revision)
  }

  async function selectSession(sessionId: string): Promise<void> {
    const revision = ++selectionRevision
    stopStream()
    _loading.value = true
    clearError()
    try {
      const session = _sessions.value.find((item) => item.sessionId === sessionId)
        ?? await harnessApi.getSession(sessionId)
      if (selectionRevision !== revision) return
      _activeSession.value = session
      _activeRun.value = null
      _messages.value = []
      _projection.value = emptyHarnessProjection()
      const runs = await harnessApi.listRuns(sessionId)
      if (selectionRevision !== revision) return
      const run = latestRun(runs, session.activeRunId)
      if (run) await activateRun(run, revision)
    } catch (error) {
      if (selectionRevision === revision) setFailure(error)
    } finally {
      if (selectionRevision === revision) _loading.value = false
    }
  }

  async function loadSessions(): Promise<void> {
    _loading.value = true
    clearError()
    try {
      const [sessions, models] = await Promise.allSettled([
        harnessApi.listSessions(),
        harnessApi.listModels(),
      ])
      if (sessions.status === 'rejected') throw sessions.reason
      _sessions.value = [...sessions.value].sort((left, right) => right.updatedAt - left.updatedAt)
      if (models.status === 'fulfilled') {
        _models.value = models.value
        const configuredModel = models.value.find((model) => model.name === settings.model)
        if (!configuredModel) setModel(models.value[0]?.name ?? '')
      }
      const selectedId = _activeSession.value?.sessionId ?? _sessions.value[0]?.sessionId
      if (selectedId) await selectSession(selectedId)
    } catch (error) {
      setFailure(error)
    } finally {
      _loading.value = false
    }
  }

  async function createSession(title = '新编程任务'): Promise<HarnessSessionState> {
    const model = settings.model.trim()
    if (!model) throw new Error('请先选择或填写模型')
    const fingerprint = JSON.stringify({
      workspacePath: settings.workspacePath.trim(), model,
      permissionMode: settings.permissionMode, approvalPolicy: settings.approvalPolicy, title,
    })
    if (pendingSessionCreate?.fingerprint !== fingerprint) {
      pendingSessionCreate = { fingerprint, key: createId('session-create') }
    }
    const session = await harnessApi.createSession({
      workspacePath: settings.workspacePath.trim() || undefined,
      model,
      permissionMode: settings.permissionMode,
      approvalPolicy: settings.approvalPolicy,
      title,
      idempotencyKey: pendingSessionCreate.key,
    })
    pendingSessionCreate = null
    _sessions.value = [session, ..._sessions.value.filter((item) => item.sessionId !== session.sessionId)]
    ++selectionRevision
    stopStream()
    _activeSession.value = session
    _activeRun.value = null
    _messages.value = []
    _projection.value = emptyHarnessProjection()
    return session
  }

  async function newSession(): Promise<void> {
    _submitting.value = true
    clearError()
    try {
      await createSession()
    } catch (error) {
      setFailure(error)
    } finally {
      _submitting.value = false
    }
  }

  async function submit(content: string): Promise<void> {
    const requirement = content.trim()
    if (!requirement || _submitting.value) return
    _submitting.value = true
    clearError()
    try {
      const session = _activeSession.value ?? await createSession(requirement.slice(0, 80))
      const currentRun = _activeRun.value
      let run: HarnessRunState
      if (!currentRun) {
        const fingerprint = `${session.sessionId}\u0000${requirement}`
        if (pendingRunCreate?.fingerprint !== fingerprint) {
          pendingRunCreate = { fingerprint, key: createId('run-create') }
        }
        run = await harnessApi.createRun(session.sessionId, {
          requirement,
          idempotencyKey: pendingRunCreate.key,
        })
        pendingRunCreate = null
      } else {
        const kind: Exclude<HarnessInputKind, 'INITIAL'> = terminalStatuses.has(currentRun.status)
          ? 'FOLLOW_UP'
          : 'STEER'
        const fingerprint = JSON.stringify({
          sessionId: session.sessionId,
          runId: currentRun.runId,
          kind,
          content: requirement,
        })
        let idempotencyKey = pendingQueuedInputs.get(fingerprint)
        if (!idempotencyKey) {
          idempotencyKey = createId('queued-input')
          pendingQueuedInputs.set(fingerprint, idempotencyKey)
        }
        run = await harnessApi.queueInput(session.sessionId, currentRun.runId, {
          kind,
          content: requirement,
          idempotencyKey,
        })
        pendingQueuedInputs.delete(fingerprint)
      }
      if (currentRun && run.runId === currentRun.runId) {
        _activeRun.value = run
        await refreshMessages(run.sessionId, selectionRevision)
      } else {
        const revision = ++selectionRevision
        await activateRun(run, revision)
      }
    } catch (error) {
      setFailure(error)
    } finally {
      _submitting.value = false
    }
  }

  async function cancel(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      _activeRun.value = await harnessApi.cancel(run.sessionId, run.runId)
    } catch (error) {
      setFailure(error)
    }
  }

  async function resume(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      const resumed = await harnessApi.resume(run.sessionId, run.runId)
      _activeRun.value = resumed
      connectStream(resumed, _projection.value.lastSequence, selectionRevision)
    } catch (error) {
      setFailure(error)
    }
  }

  async function resolveApproval(
    approvalId: string,
    decision: ApprovalDecision,
    note?: string,
  ): Promise<void> {
    const run = _activeRun.value
    const approval = run?.toolApprovals?.[approvalId]
    if (!run || !approval) return
    const normalizedNote = note?.trim() || undefined
    const fingerprint = JSON.stringify({
      approvalId,
      decision,
      note: normalizedNote ?? null,
      revision: approval.revision,
      argumentsSha256: approval.argumentsSha256,
    })
    let intent = pendingApprovalDecisions.get(approvalId)
    if (intent?.fingerprint !== fingerprint) {
      intent = { fingerprint, key: createId('decision') }
      pendingApprovalDecisions.set(approvalId, intent)
    }
    try {
      _activeRun.value = await harnessApi.resolveApproval(run.sessionId, run.runId, approvalId, {
        decisionId: intent.key,
        decision,
        expectedRevision: approval.revision,
        argumentsSha256: approval.argumentsSha256,
        note: normalizedNote,
      })
      pendingApprovalDecisions.delete(approvalId)
    } catch (error) {
      setFailure(error)
    }
  }

  function requirePlanIdentity(): PlanIdentity {
    const plan = planIdentity.value
    if (!plan) throw new Error('尚未收到可审批计划的 revision/hash，请等待事件同步')
    return plan
  }

  async function approvePlan(): Promise<void> {
    const run = _activeRun.value
    if (!run) return
    try {
      const plan = requirePlanIdentity()
      const idempotencyKey = `approve:${plan.taskId}:${plan.revision}:${plan.hash}`
      const approved = await harnessApi.approvePlan(
        run.sessionId,
        run.runId,
        plan,
        idempotencyKey,
      )
      _activeRun.value = approved
      connectStream(approved, _projection.value.lastSequence, selectionRevision)
    } catch (error) {
      setFailure(error)
    }
  }

  async function requestPlanRevision(content: string): Promise<void> {
    const run = _activeRun.value
    const feedback = content.trim()
    if (!run || !feedback) return
    try {
      const plan = requirePlanIdentity()
      const fingerprint = JSON.stringify({ plan, content: feedback })
      if (pendingPlanFeedback?.fingerprint !== fingerprint) {
        pendingPlanFeedback = { fingerprint, key: createId('feedback') }
      }
      _activeRun.value = await harnessApi.requestPlanRevision(
        run.sessionId,
        run.runId,
        plan,
        pendingPlanFeedback.key,
        feedback,
      )
      pendingPlanFeedback = null
    } catch (error) {
      setFailure(error)
    }
  }

  onScopeDispose(stopStream)

  return {
    sessions: readonly(_sessions),
    models: readonly(_models),
    activeSession: readonly(_activeSession),
    activeRun: readonly(_activeRun),
    messages: readonly(_messages),
    projection: readonly(_projection),
    settings: readonly(settings),
    loading: readonly(_loading),
    submitting: readonly(_submitting),
    error: readonly(_error),
    connection: readonly(_connection),
    planIdentity,
    pendingApprovals,
    canCancel,
    canResume,
    loadSessions,
    selectSession,
    newSession,
    submit,
    cancel,
    resume,
    resolveApproval,
    approvePlan,
    requestPlanRevision,
    setWorkspacePath,
    setModel,
    setPermissionMode,
    setApprovalPolicy,
    clearError,
  }
}

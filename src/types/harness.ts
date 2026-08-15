export type HarnessPermissionMode = 'READ_ONLY' | 'WORKSPACE_WRITE' | 'FULL_ACCESS'
export type HarnessApprovalPolicy = 'ON_REQUEST' | 'NEVER'

export type HarnessRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_APPROVAL'
  | 'WAITING_FOR_INPUT'
  | 'SUSPENDED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type HarnessInputKind = 'INITIAL' | 'STEER' | 'FOLLOW_UP'
export type HarnessMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL' | 'CONTROL'
export type ApprovalDecision = 'APPROVE' | 'DENY'
export type ApprovalState = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CONSUMED'
export type PlanStepStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'SKIPPED'
export type ExecutionMode = 'PLAN' | 'BUILD' | 'VERIFY' | 'BLOCKED' | 'COMPLETED' | 'FAILED'
export type PlanReviewState = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REVISION_REQUESTED'

export interface HarnessBudget {
  maxIterations: number
  maxToolCalls: number
  maxInputTokens: number
  maxOutputTokens: number
  maxWallTimeMillis: number
}

export interface HarnessSessionState {
  schemaVersion: number
  sessionId: string
  tenantId: string
  userId: number | string
  workspace: string
  model: string
  permissionMode: HarnessPermissionMode
  /** Missing only on sessions created by servers predating independent approval policies. */
  approvalPolicy?: HarnessApprovalPolicy
  title: string | null
  activeRunId: string | null
  createdAt: number
  updatedAt: number
  revision: number
}

export interface HarnessQueuedInput {
  inputId: string
  kind: HarnessInputKind
  content: string
  createdAt: number
}

export interface HarnessToolCall {
  toolCallId: string
  toolName: string
  arguments: string
}

export interface HarnessUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  [key: string]: unknown
}

export interface HarnessMessage {
  schemaVersion: number
  messageId: string
  sessionId: string
  runId: string
  sequence: number
  role: HarnessMessageRole
  content: string | null
  thinking: string | null
  toolCalls: readonly HarnessToolCall[]
  toolCallId: string | null
  toolName: string | null
  toolError: boolean
  usage: HarnessUsage
  metadata: Readonly<Record<string, unknown>>
  timestamp: number
}

export interface HarnessApprovalPreview {
  approvalId: string
  toolCallId: string
  toolName: string
  capability: string | null
  summary: string | null
  argumentsPreview: Readonly<Record<string, unknown>>
  status: string
  createdAt: number
  resolvedAt: number
  resolvedBy: number | string | null
  resolutionNote: string | null
}

export interface ToolCallApproval {
  schemaVersion: number
  approvalId: string
  runId: string
  toolCallId: string
  toolName: string
  argumentsSha256: string
  sessionId: string
  permissionMode: HarnessPermissionMode
  permissionRevision: number
  state: ApprovalState
  revision: number
  createdAt: number
  expiresAt: number
  updatedAt: number
}

export interface AcceptanceCriterion {
  id: string
  type: string
  expected: string
  evidenceKey: string | null
}

export interface TaskContract {
  contractId: string
  kind: string
  normalizedGoal: string
  criteria: readonly AcceptanceCriterion[]
  allowedMutationRoots: readonly string[]
  forbiddenOperations: readonly string[]
}

export interface PlanTaskStep {
  stepId: string
  title: string
  instructions: string
  status: PlanStepStatus
  dependencyIds: readonly string[]
  acceptanceCriterionIds: readonly string[]
  completionEvidenceIds: readonly string[]
  statusReason: string | null
  attempt: number
}

export interface PlanFeedback {
  feedbackId: string
  content: string
  createdAt: number
}

export interface ExecutionEvidence {
  evidenceId: string
  type: string
  canonicalKey: string | null
  successful: boolean
  summary?: string | null
  [key: string]: unknown
}

export interface ExecutionPlan {
  schemaVersion: number
  taskId: string
  revision: number
  mode: ExecutionMode
  reviewState: PlanReviewState
  contract: TaskContract
  originalRequest: string
  planMarkdown: string
  steps: readonly PlanTaskStep[]
  feedbackHistory: readonly PlanFeedback[]
  evidence: readonly ExecutionEvidence[]
  approvalReceipts: Readonly<Record<string, unknown>>
  blockedFromMode: ExecutionMode | null
  blockedReason: string | null
  failureReason: string | null
  createdAt: number
  updatedAt: number
  /** Current servers serialize this read-only digest; null keeps old snapshots decodable. */
  canonicalHash: string | null
}

export interface HarnessRunState {
  schemaVersion: number
  runId: string
  sessionId: string
  tenantId: string
  userId: number | string
  status: HarnessRunStatus
  originalRequirement: string
  permissionMode: HarnessPermissionMode
  permissionRevision: number
  budget: HarnessBudget
  executionPlan: ExecutionPlan | null
  pendingInputs: readonly HarnessQueuedInput[]
  approvals: Readonly<Record<string, HarnessApprovalPreview>>
  toolApprovals: Readonly<Record<string, ToolCallApproval>>
  iteration: number
  toolCallCount: number
  cancellationRequested: boolean
  error: string | null
  createdAt: number
  updatedAt: number
  revision: number
  [key: string]: unknown
}

export interface HarnessEvent {
  schemaVersion: number
  eventId: string
  sessionId: string
  runId: string
  sequence: number
  timestamp: number
  type: string
  stepId: string | null
  toolCallId: string | null
  approvalId: string | null
  data: Readonly<Record<string, unknown>>
}

export interface ModelOption {
  id: string
  name: string
  provider?: string
}

export interface CreateSessionInput {
  workspacePath?: string
  model: string
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
  title?: string
  /** Stable for every retry of the same logical session creation. */
  idempotencyKey: string
}

export interface CreateRunInput {
  requirement: string
  budget?: HarnessBudget
  /** Stable for every retry of the same logical run creation. */
  idempotencyKey: string
}

export interface QueueInputInput {
  kind: Exclude<HarnessInputKind, 'INITIAL'>
  content: string
  /** Stable for every retry of the same logical queued input. */
  idempotencyKey: string
}

export interface PlanIdentity {
  taskId: string
  revision: number
  hash: string
}

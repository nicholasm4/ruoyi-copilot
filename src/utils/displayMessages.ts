import type { DisplayMessage } from '../types/ui'
import type { HarnessMessage, HarnessRunState } from '../types/harness'

function appendDistinct(left: string, right: string, separator: string): string {
  const current = left.trim()
  const incoming = right.trim()
  if (!current) return incoming
  if (!incoming || current === incoming || current.endsWith(incoming)) return current
  if (incoming.startsWith(current)) return incoming
  return `${current}${separator}${incoming}`
}

export function mergeAssistantTurns(messages: readonly DisplayMessage[]): DisplayMessage[] {
  const merged: DisplayMessage[] = []
  for (const message of messages) {
    const previous = merged.at(-1)
    if (message.role !== 'ASSISTANT' || previous?.role !== 'ASSISTANT') {
      merged.push(message)
      continue
    }

    merged[merged.length - 1] = {
      ...previous,
      content: appendDistinct(previous.content, message.content, '\n\n'),
      thinking: appendDistinct(previous.thinking, message.thinking, '\n'),
      timestamp: Math.max(previous.timestamp, message.timestamp),
      streaming: Boolean(previous.streaming || message.streaming),
    }
  }
  return merged
}

function summarizedGoal(requirement: string): string {
  const normalized = requirement.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 120) return normalized
  return `${normalized.slice(0, 117)}...`
}

function changedFiles(run: HarnessRunState): string[] {
  return [...new Set((run.executionPlan?.evidence ?? [])
    .filter((item) => item.successful && item.canonicalKey?.startsWith('workspace_file:'))
    .map((item) => item.canonicalKey!.slice('workspace_file:'.length)))]
    .sort()
    .slice(0, 12)
}

/** Compatibility summary for runs completed before durable terminal reports were introduced. */
export function createRunOutcomeSummary(
  run: HarnessRunState | null,
  messages: readonly HarnessMessage[],
): DisplayMessage | null {
  if (!run || !['COMPLETED', 'FAILED', 'CANCELLED', 'SUSPENDED'].includes(run.status)) {
    return null
  }
  const hasDurableSummary = messages.some((message) => message.role === 'ASSISTANT'
    && (message.metadata.syntheticTerminalReport === true
      || message.metadata.kind === 'TERMINAL_SUMMARY'))
  if (hasDurableSummary) return null

  const goal = summarizedGoal(run.originalRequirement)
  let content: string
  if (run.status === 'COMPLETED') {
    const plan = run.executionPlan
    const completedSteps = plan?.steps.filter((step) => step.status === 'COMPLETED').length ?? 0
    const successfulEvidence = plan?.evidence.filter((item) => item.successful).length ?? 0
    const files = changedFiles(run)
    const planSummary = plan
      ? `计划步骤 ${completedSteps}/${plan.steps.length} 已完成，并通过 ${successfulEvidence} 项权威验收`
      : '运行已正常完成'
    const fileSummary = files.length
      ? `；创建或修改了 ${files.map((path) => `\`${path}\``).join('、')}`
      : ''
    content = `**任务总结：** 已完成“${goal}”。${planSummary}${fileSummary}。`
  } else if (run.status === 'FAILED') {
    content = `**任务总结：** “${goal}”未能完成。${run.error || '运行执行失败。'}`
  } else if (run.status === 'CANCELLED') {
    content = `**任务总结：** “${goal}”已取消。${run.error || '运行已按请求停止。'}`
  } else {
    content = `**任务总结：** “${goal}”已挂起。${run.error || '可继续运行以完成剩余工作。'}`
  }

  return {
    id: `run-outcome-summary-${run.runId}`,
    role: 'ASSISTANT',
    content,
    thinking: '',
    timestamp: run.updatedAt,
  }
}

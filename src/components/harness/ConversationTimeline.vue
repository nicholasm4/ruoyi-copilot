<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import MessageItem from './MessageItem.vue'
import RunTimeline from './RunTimeline.vue'
import ToolActivityGroup from './ToolActivityGroup.vue'
import ApprovalRequestCard from './ApprovalRequestCard.vue'
import AppIcon from '../AppIcon.vue'
import { useFollowScroll } from '../../composables/useFollowScroll'
import { createRunOutcomeSummary, mergeAssistantTurns } from '../../utils/displayMessages'
import type { ApprovalDecision, HarnessMessage, HarnessRunState, ToolCallApproval } from '../../types/harness'
import type { HarnessEventProjection } from '../../state/harnessEventReducer'
import type { DisplayMessage, DisplayToolActivity } from '../../types/ui'

interface Props {
  messages: readonly HarnessMessage[]
  run: HarnessRunState | null
  projection: HarnessEventProjection
  loading: boolean
  connection: string
  pendingApprovals: readonly ToolCallApproval[]
}

interface Emits {
  resolveApproval: [approvalId: string, decision: ApprovalDecision, note?: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const timeline = useTemplateRef<HTMLElement>('timeline')
const {
  isNearBottom,
  hasNewContent,
  updateScrollState,
  followNewContent,
  scrollToLatest,
} = useFollowScroll(timeline)

const displayMessages = computed<DisplayMessage[]>(() => props.messages
  .filter((message) => message.role === 'USER' || message.role === 'ASSISTANT')
  .map((message) => ({
  id: message.messageId,
  role: message.role,
  content: message.content ?? '',
  thinking: message.thinking ?? '',
  toolName: message.toolName ?? undefined,
  toolCallId: message.toolCallId ?? undefined,
  toolError: message.toolError,
  timestamp: message.timestamp,
  })))

const liveMessage = computed<DisplayMessage | null>(() => {
  const turn = props.projection.streamingTurn
  if (!turn || (turn.completed && !turn.text && !turn.thinking)) return null
  return {
    id: `live-${turn.effectId}`,
    role: 'ASSISTANT',
    content: turn.text,
    thinking: turn.thinking,
    timestamp: props.projection.events.at(-1)?.timestamp ?? 0,
    streaming: !turn.completed,
  }
})

const runOutcomeSummary = computed(() => createRunOutcomeSummary(props.run, props.messages))

const conversationMessages = computed(() => mergeAssistantTurns([
  ...displayMessages.value,
  ...(liveMessage.value ? [liveMessage.value] : []),
  ...(runOutcomeSummary.value ? [runOutcomeSummary.value] : []),
]))

const attentionApprovalId = computed(() => props.pendingApprovals.at(-1)?.approvalId ?? null)

const toolActivities = computed<DisplayToolActivity[]>(() => {
  const activities = new Map<string, DisplayToolActivity>()
  for (const message of props.messages) {
    if (message.role !== 'TOOL' || !message.toolCallId) continue
    activities.set(message.toolCallId, {
      toolCallId: message.toolCallId,
      toolName: message.toolName || 'unknown_tool',
      status: message.toolError ? 'FAILED' : 'COMPLETED',
      content: message.content ?? undefined,
      timestamp: message.timestamp,
    })
  }

  const eventTimestamps = new Map<string, number>()
  for (const event of props.projection.events) {
    if (event.toolCallId) eventTimestamps.set(event.toolCallId, event.timestamp)
  }
  for (const tool of Object.values(props.projection.tools)) {
    const persisted = activities.get(tool.toolCallId)
    activities.set(tool.toolCallId, {
      ...persisted,
      ...tool,
      status: persisted?.status ?? tool.status,
      content: persisted?.content,
      timestamp: persisted?.timestamp ?? eventTimestamps.get(tool.toolCallId) ?? 0,
    })
  }
  return [...activities.values()].sort((left, right) => left.timestamp - right.timestamp)
})

function resolveApproval(approvalId: string, decision: ApprovalDecision, note?: string): void {
  emit('resolveApproval', approvalId, decision, note)
}

watch(
  () => [props.messages.length, props.projection.lastSequence],
  async () => {
    await nextTick()
    followNewContent()
  },
)

watch(
  () => props.run?.runId,
  async (runId, previousRunId) => {
    if (runId === previousRunId) return
    await nextTick()
    scrollToLatest({ behavior: 'auto', force: true })
  },
)

onMounted(() => {
  scrollToLatest({ behavior: 'auto', force: true })
})
</script>

<template>
  <section
    ref="timeline"
    class="conversation"
    :class="{ 'conversation--empty': !run && messages.length === 0 }"
    @scroll.passive="updateScrollState"
  >
    <div v-if="loading && messages.length === 0" class="empty-state">
      <span class="spinner spinner--large" />
      <h2>正在恢复持久会话</h2>
      <p>加载消息账本、运行快照与事件序号。</p>
    </div>
    <div v-else-if="!run && messages.length === 0" class="empty-state">
      <div class="brand-symbol"><span /><span /><span /><span /></div>
      <h1>把复杂编程任务交给 Harness</h1>
      <p>它会先规划，再按权限执行工具，持续验证并在断线后从事件账本恢复。</p>
      <div class="capability-grid">
        <span>持久运行</span><span>计划审批</span><span>上下文压缩</span><span>工具策略</span>
      </div>
    </div>

    <div v-else class="timeline-inner">
      <RunTimeline v-if="run" :run="run" :events="projection.events" :connection="connection" />
      <div class="message-stream">
        <MessageItem v-for="message in conversationMessages" :key="message.id" :message="message" />
        <ToolActivityGroup v-if="toolActivities.length" :tools="toolActivities" />
      </div>
      <ApprovalRequestCard
        v-for="approval in pendingApprovals"
        :key="approval.approvalId"
        :approval="approval"
        :preview="run?.approvals?.[approval.approvalId]"
        :attention-key="approval.approvalId === attentionApprovalId ? approval.approvalId : null"
        @resolve="resolveApproval"
      />
    </div>
    <button
      v-show="!isNearBottom"
      class="scroll-latest"
      type="button"
      :aria-label="hasNewContent ? '查看新内容' : '回到最新消息'"
      @click="scrollToLatest({ behavior: 'smooth', force: true })"
    >
      <AppIcon name="chevron" :size="14" />
      {{ hasNewContent ? '有新内容' : '回到最新' }}
    </button>
  </section>
</template>

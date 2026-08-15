<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import MarkdownView from '../MarkdownView.vue'
import AppIcon from '../AppIcon.vue'
import { useAttentionTarget } from '../../composables/useAttentionTarget'
import type { ExecutionPlan, PlanIdentity } from '../../types/harness'

interface Props {
  plan: ExecutionPlan
  identity: PlanIdentity | null
  attentionKey?: string | null
}

interface Emits {
  approve: []
  requestRevision: [content: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const expanded = shallowRef(true)
const feedbackOpen = shallowRef(false)
const feedback = shallowRef('')
const approveButton = useTemplateRef<HTMLButtonElement>('approveButton')

const awaitingApproval = computed(() => props.plan.mode === 'PLAN'
  && props.plan.reviewState === 'AWAITING_APPROVAL')
const completedCount = computed(() => props.plan.steps.filter((step) =>
  step.status === 'COMPLETED' || step.status === 'SKIPPED').length)
const approvalAttentionKey = computed(() => props.attentionKey && awaitingApproval.value
  ? `${props.attentionKey}:${props.identity ? 'ready' : 'syncing'}`
  : null)

useAttentionTarget(approveButton, approvalAttentionKey)

function requestRevision(): void {
  const content = feedback.value.trim()
  if (!content) return
  emit('requestRevision', content)
  feedback.value = ''
  feedbackOpen.value = false
}
</script>

<template>
  <section class="plan-panel" data-testid="task-plan">
    <button class="plan-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="plan-icon"><AppIcon name="branch" :size="16" /></span>
      <span class="plan-heading-copy">
        <strong>权威执行计划</strong>
        <small>{{ plan.mode }} · {{ plan.reviewState }} · {{ completedCount }}/{{ plan.steps.length }} 步</small>
      </span>
      <span class="plan-revision">rev {{ plan.revision }}</span>
      <AppIcon name="chevron" :size="14" :class="{ 'rotate-90': expanded }" />
    </button>

    <div v-if="expanded" class="plan-content">
      <MarkdownView v-if="plan.planMarkdown" :content="plan.planMarkdown" />
      <ol class="plan-steps">
        <li v-for="step in plan.steps" :key="step.stepId" :class="`plan-step--${step.status.toLowerCase()}`">
          <span class="plan-step-state">
            <span v-if="step.status === 'IN_PROGRESS'" class="spinner" />
            <AppIcon v-else-if="step.status === 'COMPLETED'" name="check" :size="13" />
            <span v-else>{{ step.status === 'PENDING' ? '○' : '·' }}</span>
          </span>
          <div>
            <strong>{{ step.title }}</strong>
            <p v-if="step.instructions">{{ step.instructions }}</p>
            <small v-if="step.statusReason">{{ step.statusReason }}</small>
          </div>
        </li>
      </ol>

      <div v-if="awaitingApproval" class="plan-review">
        <p class="plan-review-hint">计划已创建。请在这里批准后开始执行；在输入框发送“继续”不能代替安全审批。</p>
        <p v-if="!identity" class="run-warning">正在同步该计划的不可变 hash，暂不能审批。</p>
        <template v-if="feedbackOpen">
          <textarea v-model="feedback" rows="3" placeholder="指出需要调整的范围、顺序或验收标准" />
          <div class="plan-actions">
            <button class="button" type="button" @click="feedbackOpen = false">取消</button>
            <button class="button button--primary" type="button" :disabled="!feedback.trim()" @click="requestRevision">提交修改意见</button>
          </div>
        </template>
        <div v-else class="plan-actions">
          <button class="button" type="button" :disabled="!identity" @click="feedbackOpen = true">要求修改</button>
          <button ref="approveButton" class="button button--primary" type="button" :disabled="!identity" @click="emit('approve')">批准并开始执行</button>
        </div>
        <code v-if="identity" class="plan-hash">{{ identity.hash }}</code>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useAttentionTarget } from '../../composables/useAttentionTarget'
import type { ApprovalDecision, HarnessApprovalPreview, ToolCallApproval } from '../../types/harness'

interface Props {
  approval: ToolCallApproval
  preview?: HarnessApprovalPreview
  attentionKey?: string | null
}

interface Emits {
  resolve: [approvalId: string, decision: ApprovalDecision, note?: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const note = shallowRef('')
const approveButton = useTemplateRef<HTMLButtonElement>('approveButton')

const argumentsText = computed(() => JSON.stringify(props.preview?.argumentsPreview ?? {}, null, 2))
const expiresLabel = computed(() => new Date(props.approval.expiresAt).toLocaleTimeString('zh-CN'))

useAttentionTarget(approveButton, () => props.attentionKey ?? null)

function resolve(decision: ApprovalDecision): void {
  emit('resolve', props.approval.approvalId, decision, note.value.trim() || undefined)
}
</script>

<template>
  <article class="approval-card" data-testid="approval-card">
    <div class="approval-heading">
      <span class="approval-icon"><AppIcon name="terminal" :size="17" /></span>
      <div>
        <strong>需要确认：{{ preview?.summary || approval.toolName }}</strong>
        <small>{{ approval.toolName }} · {{ preview?.capability || '受策略保护的工具调用' }} · {{ expiresLabel }} 前有效</small>
      </div>
    </div>
    <pre v-if="argumentsText !== '{}'" class="approval-arguments">{{ argumentsText }}</pre>
    <label class="approval-note">
      <span>审批备注（可选）</span>
      <input v-model="note" placeholder="说明允许或拒绝的原因" />
    </label>
    <div class="approval-actions">
      <button type="button" class="button button--danger" @click="resolve('DENY')">拒绝</button>
      <button ref="approveButton" type="button" class="button button--primary" @click="resolve('APPROVE')">仅批准本次</button>
    </div>
    <p class="approval-hash">参数摘要 {{ approval.argumentsSha256.slice(0, 16) }}… · revision {{ approval.revision }}</p>
  </article>
</template>

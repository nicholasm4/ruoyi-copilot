<script setup lang="ts">
import TaskPlanPanel from './TaskPlanPanel.vue'
import AppIcon from '../AppIcon.vue'
import type { ExecutionPlan, PlanIdentity } from '../../types/harness'

interface Props {
  plan: ExecutionPlan
  identity: PlanIdentity | null
  attentionKey?: string | null
}

interface Emits {
  close: []
  approve: []
  requestRevision: [content: string]
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <aside id="task-plan-inspector" class="task-inspector" aria-label="任务计划详情">
    <header class="task-inspector-header">
      <div class="task-inspector-title">
        <span>任务预览</span>
        <strong>执行计划</strong>
      </div>
      <button class="icon-button" type="button" aria-label="关闭任务预览" @click="emit('close')">
        <AppIcon name="x" :size="16" />
      </button>
    </header>
    <div class="task-inspector-body">
      <TaskPlanPanel
        :plan="plan"
        :identity="identity"
        :attention-key="attentionKey"
        @approve="emit('approve')"
        @request-revision="emit('requestRevision', $event)"
      />
    </div>
  </aside>
</template>

<style scoped>
.task-inspector {
  width: 372px;
  min-width: 320px;
  flex: 0 0 372px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--color-border);
  background: rgba(247, 247, 245, 0.96);
}

.task-inspector-header {
  min-height: 62px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
}

.task-inspector-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-inspector-title span {
  color: var(--color-text-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.task-inspector-title strong {
  font-size: 14px;
  font-weight: 650;
}

.task-inspector-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.task-inspector-body :deep(.plan-panel) {
  margin: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.task-inspector-body :deep(.plan-header) {
  padding: 8px 4px 12px;
}

.task-inspector-body :deep(.plan-content) {
  padding: 0 4px 16px;
}

@media (max-width: 1100px) {
  .task-inspector {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 25;
    width: min(390px, 100%);
    min-width: 0;
    box-shadow: -18px 0 42px rgba(24, 24, 27, 0.13);
  }
}

@media (max-width: 560px) {
  .task-inspector { width: 100%; }
}
</style>

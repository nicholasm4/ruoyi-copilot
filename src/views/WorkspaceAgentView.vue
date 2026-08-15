<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import SessionSidebar from '../components/harness/SessionSidebar.vue'
import ConversationTimeline from '../components/harness/ConversationTimeline.vue'
import AgentComposer from '../components/harness/AgentComposer.vue'
import TaskPlanDrawer from '../components/harness/TaskPlanDrawer.vue'
import AppIcon from '../components/AppIcon.vue'
import { useHarnessAgent } from '../composables/useHarnessAgent'

interface Props {
  userName: string
}

defineProps<Props>()
const emit = defineEmits<{ logout: [] }>()

const agent = useHarnessAgent()
const sidebarCollapsed = shallowRef(false)
const mobileSidebarOpen = shallowRef(false)
const planInspectorOpen = shallowRef(false)

const title = computed(() => agent.activeSession.value?.title || '新编程任务')
const workspaceLabel = computed(() => agent.activeSession.value?.workspace
  || agent.settings.workspacePath
  || '默认工作区')
const activePlan = computed(() => agent.activeRun.value?.executionPlan ?? null)
const completedPlanSteps = computed(() => activePlan.value?.steps.filter((step) =>
  step.status === 'COMPLETED' || step.status === 'SKIPPED').length ?? 0)
const pendingPlanApprovalKey = computed(() => {
  const plan = activePlan.value
  return plan?.mode === 'PLAN' && plan.reviewState === 'AWAITING_APPROVAL'
    ? `${plan.taskId}:${plan.revision}`
    : null
})
const planNeedsReview = computed(() => pendingPlanApprovalKey.value !== null)

watch(
  pendingPlanApprovalKey,
  (key, previousKey) => {
    if (key && key !== previousKey) planInspectorOpen.value = true
  },
  { immediate: true },
)
function submit(content: string): void {
  void agent.submit(content)
}

function collapseSidebar(): void {
  sidebarCollapsed.value = true
  mobileSidebarOpen.value = false
}

function openSidebar(): void {
  sidebarCollapsed.value = false
  mobileSidebarOpen.value = true
}

onMounted(() => {
  void agent.loadSessions()
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <button
      v-if="mobileSidebarOpen"
      class="sidebar-scrim"
      aria-label="关闭会话侧栏"
      @click="mobileSidebarOpen = false"
    />
    <SessionSidebar
      :sessions="agent.sessions.value"
      :active-session-id="agent.activeSession.value?.sessionId ?? null"
      :loading="agent.loading.value"
      :open="mobileSidebarOpen"
      :user-name="userName"
      :busy="agent.submitting.value"
      @collapse="collapseSidebar"
      @close="mobileSidebarOpen = false"
      @new-session="agent.newSession"
      @select="agent.selectSession"
      @logout="emit('logout')"
    />

    <main class="main-panel">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button mobile-menu" aria-label="展开会话侧栏" @click="openSidebar">
            <AppIcon name="panel" :size="18" />
          </button>
          <div class="title-stack">
            <strong>{{ title }}</strong>
            <span><AppIcon name="folder" :size="12" /> {{ workspaceLabel }}</span>
          </div>
        </div>
        <div v-if="activePlan" class="topbar-actions">
          <button
            class="task-preview-trigger"
            :class="{ 'task-preview-trigger--attention': planNeedsReview }"
            type="button"
            aria-controls="task-plan-inspector"
            :aria-expanded="planInspectorOpen"
            @click="planInspectorOpen = !planInspectorOpen"
          >
            <AppIcon name="branch" :size="15" />
            <span>{{ planNeedsReview ? '计划待审批' : '任务计划' }}</span>
            <small>{{ completedPlanSteps }}/{{ activePlan.steps.length }}</small>
          </button>
        </div>
      </header>

      <div class="workspace-stage">
        <div class="conversation-column">
          <div v-if="agent.error.value" class="error-banner" role="alert">
            <span>{{ agent.error.value }}</span>
            <button type="button" @click="agent.clearError">关闭</button>
          </div>

          <ConversationTimeline
            :messages="agent.messages.value"
            :run="agent.activeRun.value"
            :projection="agent.projection.value"
            :loading="agent.loading.value"
            :connection="agent.connection.value"
            :pending-approvals="agent.pendingApprovals.value"
            @resolve-approval="agent.resolveApproval"
          />

          <AgentComposer
            :models="agent.models.value"
            :model="agent.settings.model"
            :workspace-path="agent.settings.workspacePath"
            :permission-mode="agent.settings.permissionMode"
            :approval-policy="agent.settings.approvalPolicy"
            :active-permission-mode="agent.activeSession.value?.permissionMode ?? null"
            :active-approval-policy="agent.activeSession.value
              ? (agent.activeSession.value.approvalPolicy ?? 'ON_REQUEST')
              : null"
            :run-status="agent.activeRun.value?.status ?? null"
            :submitting="agent.submitting.value"
            :can-cancel="agent.canCancel.value"
            :can-resume="agent.canResume.value"
            @update:model="agent.setModel"
            @update:workspace-path="agent.setWorkspacePath"
            @update:permission-mode="agent.setPermissionMode"
            @update:approval-policy="agent.setApprovalPolicy"
            @submit="submit"
            @cancel="agent.cancel"
            @resume="agent.resume"
          />
        </div>

        <TaskPlanDrawer
          v-if="activePlan"
          v-show="planInspectorOpen"
          :plan="activePlan"
          :identity="agent.planIdentity.value"
          :attention-key="pendingPlanApprovalKey"
          @close="planInspectorOpen = false"
          @approve="agent.approvePlan"
          @request-revision="agent.requestPlanRevision"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import ContextPicker from './ContextPicker.vue'
import PermissionModePicker from './PermissionModePicker.vue'
import ApprovalPolicyPicker from './ApprovalPolicyPicker.vue'
import ModelPicker from './ModelPicker.vue'
import { approvalPolicyLabel, permissionModeLabel } from '../../utils/harnessLabels'
import type {
  HarnessApprovalPolicy,
  HarnessPermissionMode,
  HarnessRunStatus,
  ModelOption,
} from '../../types/harness'

interface Props {
  models: readonly ModelOption[]
  model: string
  workspacePath: string
  permissionMode: HarnessPermissionMode
  approvalPolicy: HarnessApprovalPolicy
  activePermissionMode?: HarnessPermissionMode | null
  activeApprovalPolicy?: HarnessApprovalPolicy | null
  runStatus: HarnessRunStatus | null
  submitting: boolean
  canCancel: boolean
  canResume: boolean
}

interface Emits {
  'update:model': [value: string]
  'update:workspacePath': [value: string]
  'update:permissionMode': [value: HarnessPermissionMode]
  'update:approvalPolicy': [value: HarnessApprovalPolicy]
  submit: [content: string]
  cancel: []
  resume: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const draft = shallowRef('')
const settingsOpen = shallowRef(false)
const composer = useTemplateRef<HTMLTextAreaElement>('composer')
const effectivePermissionMode = computed(() => props.activePermissionMode ?? props.permissionMode)
const effectiveApprovalPolicy = computed(() => props.activeApprovalPolicy ?? props.approvalPolicy)
const executionPolicyLabel = computed(() =>
  `${permissionModeLabel(effectivePermissionMode.value)} · ${approvalPolicyLabel(effectiveApprovalPolicy.value)}`,
)

const placeholder = computed(() => {
  if (!props.runStatus) return '描述一个复杂编程任务；Harness 会规划、执行并验证…'
  if (props.runStatus === 'RUNNING' || props.runStatus === 'QUEUED') return '输入新约束以 steering 当前运行…'
  if (props.runStatus === 'WAITING_FOR_APPROVAL') return '可补充说明，或先处理上方工具审批…'
  if (props.runStatus === 'WAITING_FOR_INPUT') return '补充信息，或在计划卡片中批准/要求修改…'
  if (props.runStatus === 'SUSPENDED') return '运行已挂起，可先恢复，或描述新的后续任务…'
  return '继续这个会话，创建一个 follow-up 运行…'
})

function submit(): void {
  const content = draft.value.trim()
  if (!content || props.submitting) return
  emit('submit', content)
  draft.value = ''
  void nextTick(() => composer.value?.focus())
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <footer class="composer-wrap">
    <div v-show="settingsOpen" class="composer-settings" role="dialog" aria-label="会话设置">
      <ContextPicker :workspace-path="workspacePath" @update="emit('update:workspacePath', $event)" />
      <ModelPicker :value="model" :models="models" @update="emit('update:model', $event)" />
      <PermissionModePicker :value="permissionMode" @update="emit('update:permissionMode', $event)" />
      <ApprovalPolicyPicker :value="approvalPolicy" @update="emit('update:approvalPolicy', $event)" />
      <p v-if="runStatus" class="settings-lock-note">这些设置用于新会话；当前持久会话继续使用创建时的快照。</p>
    </div>

    <div class="composer">
      <textarea
        ref="composer"
        v-model="draft"
        rows="2"
        :placeholder="placeholder"
        :disabled="submitting"
        @keydown="onKeydown"
      />
      <div class="composer-toolbar">
        <div class="composer-options">
          <button
            class="tool-button"
            type="button"
            :class="{ active: settingsOpen }"
            title="会话设置"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          >
            <AppIcon name="settings" :size="16" />
          </button>
          <span class="permission-chip">{{ executionPolicyLabel }}</span>
          <span class="model-chip">{{ model || '未选择模型' }}</span>
        </div>
        <div class="composer-actions">
          <button v-if="canResume" class="button" type="button" @click="emit('resume')">恢复运行</button>
          <button v-if="canCancel" class="stop-button" type="button" aria-label="取消运行" @click="emit('cancel')">
            <AppIcon name="x" :size="14" />
          </button>
          <button class="send-button" type="button" :disabled="!draft.trim() || submitting" aria-label="发送" @click="submit">
            <span v-if="submitting" class="spinner" />
            <AppIcon v-else name="send" :size="17" :stroke-width="2.2" />
          </button>
        </div>
      </div>
    </div>
    <p class="composer-hint">
      <template v-if="effectiveApprovalPolicy === 'NEVER'">
        Enter 发送 · Shift+Enter 换行 · 全自动执行，越权和契约禁止操作仍会被拒绝
      </template>
      <template v-else>
        Enter 发送 · Shift+Enter 换行 · 危险操作会按需请求一次性审批
      </template>
    </p>
  </footer>
</template>

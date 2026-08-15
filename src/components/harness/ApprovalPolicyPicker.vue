<script setup lang="ts">
import type { HarnessApprovalPolicy } from '../../types/harness'

interface Props {
  value: HarnessApprovalPolicy
}

interface Emits {
  update: [value: HarnessApprovalPolicy]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const options: Array<{ value: HarnessApprovalPolicy; label: string; hint: string }> = [
  { value: 'NEVER', label: '全自动', hint: '不暂停询问；越权和契约禁止操作仍会拒绝' },
  { value: 'ON_REQUEST', label: '按需审批', hint: '执行、网络及破坏性操作先请求确认' },
]
</script>

<template>
  <fieldset class="permission-picker approval-policy-picker">
    <legend>审批策略</legend>
    <label v-for="option in options" :key="option.value" :class="{ active: value === option.value }">
      <input
        type="radio"
        name="approval-policy"
        :value="option.value"
        :checked="value === option.value"
        @change="emit('update', option.value)"
      />
      <span><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></span>
    </label>
  </fieldset>
</template>

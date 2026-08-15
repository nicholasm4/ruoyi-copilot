<script setup lang="ts">
import type { HarnessPermissionMode } from '../../types/harness'

interface Props {
  value: HarnessPermissionMode
}

interface Emits {
  update: [value: HarnessPermissionMode]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const options: Array<{ value: HarnessPermissionMode; label: string; hint: string }> = [
  { value: 'READ_ONLY', label: '只读', hint: '仅调查与分析' },
  { value: 'WORKSPACE_WRITE', label: '工作区写入', hint: '可修改当前工作区；审批由独立策略控制' },
  { value: 'FULL_ACCESS', label: '完整访问', hint: '允许完整执行范围；仍受硬性安全边界约束' },
]
</script>

<template>
  <fieldset class="permission-picker">
    <legend>权限模式</legend>
    <label v-for="option in options" :key="option.value" :class="{ active: value === option.value }">
      <input
        type="radio"
        name="permission-mode"
        :value="option.value"
        :checked="value === option.value"
        @change="emit('update', option.value)"
      />
      <span><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></span>
    </label>
  </fieldset>
</template>

<script setup lang="ts">
import AppIcon from '../AppIcon.vue'

interface Props {
  workspacePath: string
}

interface Emits {
  update: [value: string]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

function update(event: Event): void {
  emit('update', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <label class="setting-field setting-field--wide">
    <span><AppIcon name="folder" :size="14" /> 工作区</span>
    <input
      :value="workspacePath"
      type="text"
      placeholder="留空使用后端默认工作区"
      @input="update"
    />
    <small>会话创建后工作区不可变；路径由后端 canonical guard 校验。</small>
  </label>
</template>

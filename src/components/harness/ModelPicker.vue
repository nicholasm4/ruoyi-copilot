<script setup lang="ts">
import type { ModelOption } from '../../types/harness'

interface Props {
  value: string
  models: readonly ModelOption[]
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
  <label class="setting-field">
    <span>模型</span>
    <input :value="value" list="harness-model-options" placeholder="模型配置名称" @input="update" />
    <datalist id="harness-model-options">
      <option v-for="model in models" :key="model.id" :value="model.name">{{ model.provider }}</option>
    </datalist>
  </label>
</template>

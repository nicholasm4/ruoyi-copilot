<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'

interface Props {
  toolCallId: string
  toolName: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  arguments?: string
  content?: string
  code?: string
}

const props = defineProps<Props>()
const expanded = shallowRef(false)
const statusText = computed(() => ({
  RUNNING: '执行中', COMPLETED: '已完成', FAILED: '失败',
})[props.status])
const displayName = computed(() => ({
  apply_patch: '修改文件',
  shell_command: '运行命令',
  web__run: '检索资料',
  read_file: '读取文件',
  write_file: '写入文件',
  execute_process: '执行进程',
}[props.toolName] ?? props.toolName.replaceAll('_', ' ')))
const statusDetail = computed(() => props.code ? `${statusText.value} · ${props.code}` : statusText.value)

function formatPayload(value?: string): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

const argumentsPreview = computed(() => formatPayload(props.arguments))
const contentPreview = computed(() => formatPayload(props.content))
</script>

<template>
  <article class="tool-call-card" :class="`tool-call-card--${status.toLowerCase()}`">
    <button class="tool-call-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="tool-call-icon">
        <span v-if="status === 'RUNNING'" class="spinner" />
        <AppIcon v-else :name="status === 'FAILED' ? 'x' : 'check'" :size="13" />
      </span>
      <span class="tool-call-copy">
        <strong>{{ displayName }}</strong>
        <small>{{ toolName }}</small>
      </span>
      <span class="tool-call-code">{{ statusDetail }}</span>
      <AppIcon name="chevron" :size="13" :class="{ 'rotate-90': expanded }" />
    </button>
    <div v-if="expanded" class="tool-call-detail">
      <code>{{ toolCallId }}</code>
      <pre v-if="argumentsPreview">{{ argumentsPreview }}</pre>
      <pre v-if="contentPreview">{{ contentPreview }}</pre>
    </div>
  </article>
</template>

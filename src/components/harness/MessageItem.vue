<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import MarkdownView from '../MarkdownView.vue'
import AppIcon from '../AppIcon.vue'
import ToolCallCard from './ToolCallCard.vue'
import type { DisplayMessage } from '../../types/ui'

interface Props {
  message: DisplayMessage
}

const props = defineProps<Props>()
const copied = shallowRef(false)
const thinkingOpen = shallowRef(false)
const thinkingId = computed(() => `thinking-${props.message.id}`)
const roleLabel = computed(() => ({
  SYSTEM: '系统', USER: '你', ASSISTANT: 'Harness', TOOL: props.message.toolName || '工具', CONTROL: '控制输入',
})[props.message.role])

async function copyContent(): Promise<void> {
  await navigator.clipboard?.writeText(props.message.content)
  copied.value = true
  globalThis.setTimeout(() => { copied.value = false }, 1_500)
}
</script>

<template>
  <article
    class="message"
    :class="[`message--${message.role.toLowerCase()}`, { 'message--streaming': message.streaming }]"
    :data-message-id="message.id"
  >
    <div class="message-avatar" :aria-label="roleLabel">
      <span v-if="message.role === 'ASSISTANT'" class="assistant-glyph">H</span>
      <span v-else>{{ roleLabel.slice(0, 1) }}</span>
    </div>
    <div class="message-body">
      <div class="message-meta">
        <strong v-if="message.role !== 'USER'">{{ roleLabel }}</strong>
        <time v-if="message.timestamp">{{ new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</time>
      </div>
      <div v-if="message.thinking" class="thinking-block">
        <button
          class="thinking-heading"
          type="button"
          :aria-expanded="thinkingOpen"
          :aria-controls="thinkingId"
          @click="thinkingOpen = !thinkingOpen"
        >
          <span v-if="message.streaming" class="spinner" />
          <span>推理过程</span>
          <AppIcon name="chevron" :size="12" :class="{ 'rotate-90': thinkingOpen }" />
        </button>
        <p :id="thinkingId" v-show="thinkingOpen">{{ message.thinking }}</p>
      </div>
      <ToolCallCard
        v-if="message.role === 'TOOL'"
        :tool-call-id="message.toolCallId || message.id"
        :tool-name="message.toolName || 'tool'"
        :status="message.toolError ? 'FAILED' : 'COMPLETED'"
        :content="message.content"
      />
      <div v-else-if="message.content" class="message-text">
        <MarkdownView :content="message.content" />
      </div>
      <button v-if="message.content && message.role === 'ASSISTANT'" class="copy-action" type="button" @click="copyContent">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="13" /> {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
  </article>
</template>

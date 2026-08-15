<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import ToolCallCard from './ToolCallCard.vue'
import type { DisplayToolActivity } from '../../types/ui'

interface Props {
  tools: readonly DisplayToolActivity[]
}

const props = defineProps<Props>()
const expanded = shallowRef(false)

const runningCount = computed(() => props.tools.filter((tool) => tool.status === 'RUNNING').length)
const failedCount = computed(() => props.tools.filter((tool) => tool.status === 'FAILED').length)
const latestTool = computed(() => props.tools.at(-1))
const summary = computed(() => {
  if (runningCount.value) return `正在调用 ${runningCount.value} 个工具`
  if (failedCount.value) return `${props.tools.length} 个工具 · ${failedCount.value} 个失败`
  return `${props.tools.length} 个工具已完成`
})
</script>

<template>
  <section class="tool-activity" :class="{ 'tool-activity--active': runningCount > 0 }" aria-label="工具活动">
    <button
      class="tool-activity-trigger"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="tool-activity-status" aria-hidden="true">
        <span v-if="runningCount" class="spinner" />
        <AppIcon v-else :name="failedCount ? 'x' : 'check'" :size="13" />
      </span>
      <span class="tool-activity-copy">
        <strong>{{ summary }}</strong>
        <small v-if="latestTool">最近：{{ latestTool.toolName }}</small>
      </span>
      <AppIcon name="chevron" :size="14" :class="{ 'rotate-90': expanded }" />
    </button>
    <div v-show="expanded" class="tool-activity-content">
      <ToolCallCard
        v-for="tool in tools"
        :key="tool.toolCallId"
        :tool-call-id="tool.toolCallId"
        :tool-name="tool.toolName"
        :status="tool.status"
        :arguments="tool.arguments"
        :content="tool.content"
        :code="tool.code"
      />
    </div>
  </section>
</template>

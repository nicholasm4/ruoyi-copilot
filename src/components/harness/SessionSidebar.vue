<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import { permissionModeLabel } from '../../utils/harnessLabels'
import type { HarnessSessionState } from '../../types/harness'

interface Props {
  sessions: readonly HarnessSessionState[]
  activeSessionId: string | null
  loading: boolean
  open: boolean
  userName: string
  busy: boolean
}

interface Emits {
  collapse: []
  close: []
  newSession: []
  select: [sessionId: string]
  logout: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const query = shallowRef('')

const visibleSessions = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  if (!normalized) return props.sessions
  return props.sessions.filter((session) =>
    (session.title ?? '').toLocaleLowerCase().includes(normalized)
    || session.workspace.toLocaleLowerCase().includes(normalized),
  )
})

function formatTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function select(sessionId: string): void {
  emit('select', sessionId)
  emit('close')
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': open }">
    <div class="window-bar">
      <div class="window-brand"><span class="brand-glyph">H</span> Harness</div>
      <button class="icon-button sidebar-toggle" aria-label="收起侧栏" @click="emit('collapse')">
        <AppIcon name="panel" :size="17" />
      </button>
    </div>

    <div class="sidebar-content">
      <button class="new-thread" type="button" :disabled="busy" @click="emit('newSession')">
        <AppIcon name="compose" :size="17" />
        <span>{{ busy ? '正在创建…' : '新建编程任务' }}</span>
        <kbd>⌘ N</kbd>
      </button>
      <label class="sidebar-search">
        <AppIcon name="search" :size="15" />
        <input v-model="query" type="search" placeholder="搜索会话或工作区" />
      </label>

      <div class="thread-list">
        <div class="thread-group-label">持久会话</div>
        <div v-if="loading && sessions.length === 0" class="sidebar-state"><span class="spinner" /> 正在同步</div>
        <div v-else-if="visibleSessions.length === 0" class="sidebar-state">暂无会话</div>
        <button
          v-for="session in visibleSessions"
          v-else
          :key="session.sessionId"
          type="button"
          class="thread-item"
          :class="{ 'thread-item--active': session.sessionId === activeSessionId }"
          @click="select(session.sessionId)"
        >
          <span class="thread-title">{{ session.title || '未命名任务' }}</span>
          <span class="thread-preview">{{ permissionModeLabel(session.permissionMode) }} · {{ session.model }}</span>
          <span class="thread-time">{{ formatTime(session.updatedAt) }}</span>
        </button>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="account-row">
        <span class="avatar">{{ (userName || '用户').slice(0, 1).toLocaleUpperCase() }}</span>
        <span class="account-copy">
          <strong>{{ userName || '当前用户' }}</strong>
          <small>已安全登录</small>
        </span>
        <button class="account-logout" type="button" title="退出登录" @click="emit('logout')">
          退出
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from './components/AppIcon.vue'
import { authApi, conversationApi, modelApi, streamChat, workspaceApi } from './api/client'

const sidebarOpen = ref(false)
const prompt = ref('')
const access = ref('工作区访问')
const menuOpen = ref(false)
const composer = ref(null)
const searchOpen = ref(false)
const searchQuery = ref('')
const user = ref(null)
const conversations = ref([])
const messages = ref([])
const models = ref([])
const selectedModelId = ref('')
const activeConversationId = ref(null)
const workspaceFileCount = ref(0)
const loadingConversations = ref(false)
const loadingMessages = ref(false)
const creatingConversation = ref(false)
const sending = ref(false)
const notice = ref('')
let abortController = null
const DEMO_CONVERSATION_ID = 'local-demo-task'
let demoStarted = false

const selectedModel = computed(() => models.value.find((item) => String(item.modelConfigId) === selectedModelId.value))
const activeConversation = computed(() => conversations.value.find((item) => item.conversationId === activeConversationId.value))
const visibleConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return query
    ? conversations.value.filter((item) => (item.title || '').toLowerCase().includes(query))
    : conversations.value
})

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`
  if (diff < 172_800_000) return '昨天'
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function showNotice(message) {
  notice.value = message
  window.setTimeout(() => { notice.value = '' }, 3200)
}

async function loadConversations(selectFirst = false) {
  loadingConversations.value = true
  try {
    const result = await conversationApi.list()
    conversations.value = result?.records || []
    if (selectFirst && !activeConversationId.value && conversations.value.length) {
      await selectThread(conversations.value[0].conversationId)
    }
  } finally {
    loadingConversations.value = false
  }
}

async function loadModels() {
  models.value = await modelApi.list()
  if (models.value.length && !selectedModelId.value) {
    selectedModelId.value = String(models.value[0].modelConfigId)
  }
}

async function loadWorkspace() {
  try {
    const result = await workspaceApi.files()
    workspaceFileCount.value = result?.fileCount ?? Object.keys(result?.files || {}).length
  } catch {
    workspaceFileCount.value = 0
  }
}

async function bootstrap() {
  const results = await Promise.allSettled([loadModels(), loadConversations(true), loadWorkspace()])
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) showNotice(failed.reason?.message || '部分工作区数据加载失败')
  if (conversations.value.length === 0) startDefaultTask()
}

function startDefaultTask() {
  if (demoStarted) return
  demoStarted = true

  conversations.value = [{
    conversationId: DEMO_CONVERSATION_ID,
    title: '优化工作台交互反馈',
    messageCount: 2,
    updatedTime: new Date().toISOString(),
  }]
  activeConversationId.value = DEMO_CONVERSATION_ID

  const assistantMessage = {
    id: 'demo-assistant',
    role: 'assistant',
    text: '我会检查当前工作台的状态反馈，并补充清晰的任务执行过程。',
    thinking: '正在定位界面入口、消息流和状态组件…',
    streaming: true,
    operations: [{
      id: 'demo-scan',
      type: 'list-progress',
      content: '扫描 src/App.vue 与视觉样式',
      status: 'running',
    }],
  }

  messages.value = [
    {
      id: 'demo-user',
      role: 'user',
      text: '检查工作台的任务状态反馈，让执行过程更容易观察。',
      operations: [],
    },
    assistantMessage,
  ]

  window.setTimeout(() => {
    assistantMessage.operations[0].status = 'done'
    assistantMessage.operations.push({
      id: 'demo-edit',
      type: 'edit-progress',
      filePath: 'src/App.vue',
      content: '+ 增加任务阶段状态\n+ 增加文件变更反馈\n+ 保持对话流持续更新',
      status: 'running',
    })
    assistantMessage.thinking = '已确认状态展示结构，正在更新任务执行反馈…'
  }, 1200)

  window.setTimeout(() => {
    assistantMessage.operations[1].status = 'done'
    assistantMessage.operations.push({
      id: 'demo-build',
      type: 'cmd',
      command: 'npm run build',
      status: 'running',
    })
    assistantMessage.thinking = '界面调整完成，正在执行生产构建验证…'
  }, 2800)

  window.setTimeout(() => {
    assistantMessage.operations[2].status = 'done'
    assistantMessage.thinking = ''
    assistantMessage.streaming = false
    assistantMessage.text += '\n\n状态反馈已更新，任务阶段、文件变更和构建结果现在会在同一条执行流中持续呈现。'
  }, 4600)
}

async function selectThread(conversationId) {
  if (sending.value || conversationId === activeConversationId.value) {
    sidebarOpen.value = false
    return
  }
  if (conversationId === DEMO_CONVERSATION_ID) {
    activeConversationId.value = conversationId
    sidebarOpen.value = false
    return
  }
  activeConversationId.value = conversationId
  sidebarOpen.value = false
  loadingMessages.value = true
  try {
    const history = await conversationApi.messages(conversationId)
    messages.value = (history || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      role: item.role,
      text: item.content || '',
      createdAt: item.createdAt,
      operations: [],
    }))
    await nextTick()
    document.querySelector('.conversation')?.scrollTo({ top: 999999 })
  } catch (error) {
    showNotice(error.message)
  } finally {
    loadingMessages.value = false
  }
}

async function newThread() {
  if (creatingConversation.value) return
  creatingConversation.value = true
  try {
    const conversation = await conversationApi.create(selectedModelId.value)
    conversations.value.unshift(conversation)
    activeConversationId.value = conversation.conversationId
    messages.value = []
    prompt.value = ''
    sidebarOpen.value = false
    await nextTick()
    composer.value?.focus()
  } catch (error) {
    showNotice(error.message)
  } finally {
    creatingConversation.value = false
  }
}

function applyStreamEvent(message, event) {
  const payload = event.payload
  const eventType = payload?.event || event.type
  const data = payload?.data || payload

  if (payload?.choices?.[0]?.delta?.content) {
    message.text += payload.choices[0].delta.content
    return
  }
  if (eventType === 'text' && data?.content) message.text += data.content
  if (eventType === 'thinking' && data?.content) message.thinking = (message.thinking || '') + data.content
  if (eventType === 'conversation-id' && payload?.conversationId) activeConversationId.value = payload.conversationId

  if (/^(add|edit|delete)-(start|progress|end)$/.test(eventType) || eventType === 'cmd' || eventType === 'list-progress') {
    const operationId = data?.filePath
      ? `${eventType.split('-')[0]}-${data.filePath}`
      : payload?.operationId || `${eventType}-${data?.command || Date.now()}`
    const existing = message.operations.find((item) => item.id === operationId)
    const operation = {
      id: operationId,
      type: eventType,
      filePath: data?.filePath,
      command: data?.command,
      content: data?.content,
      status: eventType.endsWith('-end') ? 'done' : 'running',
    }
    if (existing) Object.assign(existing, operation)
    else message.operations.push(operation)
  }
}

async function sendMessage() {
  const text = prompt.value.trim()
  if (!text || sending.value) return
  if (!selectedModel.value) {
    showNotice('请先在后端配置可用模型')
    return
  }

  if (!activeConversationId.value) await newThread()
  if (!activeConversationId.value) return

  const userMessage = { id: crypto.randomUUID(), role: 'user', text }
  const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', thinking: '', operations: [], streaming: true }
  messages.value.push(userMessage, assistantMessage)
  prompt.value = ''
  sending.value = true
  menuOpen.value = false
  abortController = new AbortController()

  await nextTick()
  document.querySelector('.conversation')?.scrollTo({ top: 999999, behavior: 'smooth' })

  try {
    await streamChat({
      message: { id: userMessage.id, role: 'user', content: text, timestamp: new Date().toISOString() },
      modelConfigId: String(selectedModel.value.modelConfigId),
      conversationId: activeConversationId.value,
      enablePreferences: true,
      enablePreferenceLearning: true,
      tools: [],
    }, {
      signal: abortController.signal,
      onEvent: (event) => applyStreamEvent(assistantMessage, event),
    })
    await loadConversations()
  } catch (error) {
    if (error.name !== 'AbortError') {
      assistantMessage.error = error.message
      showNotice(error.message)
    }
  } finally {
    assistantMessage.streaming = false
    sending.value = false
    abortController = null
  }
}

function stopMessage() {
  abortController?.abort()
}

function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

onMounted(async () => {
  const token = localStorage.getItem('token')
  if (token) {
    try {
      user.value = await authApi.me()
    } catch (error) {
      showNotice(error.message)
    }
  }
  await bootstrap()
})
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="sidebar-scrim" @click="sidebarOpen = false" />

    <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }">
      <div class="window-bar">
        <span class="window-brand">Copilot</span>
        <button class="icon-button sidebar-toggle" aria-label="收起侧栏" @click="sidebarOpen = false">
          <AppIcon name="panel" :size="17" />
        </button>
      </div>

      <div class="sidebar-content">
        <button class="new-thread" :disabled="creatingConversation" @click="newThread">
          <AppIcon name="compose" :size="17" />
          <span>{{ creatingConversation ? '创建中…' : '新建任务' }}</span>
          <kbd>⌘ N</kbd>
        </button>
        <button class="nav-row" @click="searchOpen = !searchOpen">
          <AppIcon name="search" :size="17" />
          <span>搜索</span>
          <kbd>⌘ K</kbd>
        </button>
        <input v-if="searchOpen" v-model="searchQuery" class="thread-search" autofocus placeholder="搜索任务" />

        <section class="workspace-card">
          <div class="workspace-heading">
            <span class="workspace-mark">A</span>
            <div>
              <strong>Alibaba Copilot</strong>
              <small>{{ workspaceFileCount ? `${workspaceFileCount} 个文件` : '工作区已连接' }}</small>
            </div>
            <AppIcon name="chevron" :size="14" />
          </div>
          <button class="branch-row">
            <AppIcon name="branch" :size="15" />
            <span>后端服务</span>
            <span class="sync-dot" />
          </button>
        </section>

        <div class="thread-list">
          <div class="thread-group-label">任务</div>
          <div v-if="loadingConversations" class="sidebar-state"><span class="spinner" /> 正在同步</div>
          <div v-else-if="visibleConversations.length === 0" class="sidebar-state">暂无任务</div>
          <button
            v-for="thread in visibleConversations"
            v-else
            :key="thread.conversationId"
            class="thread-item"
            :class="{ 'thread-item--active': thread.conversationId === activeConversationId }"
            @click="selectThread(thread.conversationId)"
          >
            <span class="thread-title">{{ thread.title || '新任务' }}</span>
            <span class="thread-preview">{{ thread.messageCount || 0 }} 条消息</span>
            <span class="thread-time">{{ formatTime(thread.lastMessageTime || thread.updatedTime) }}</span>
            <AppIcon class="thread-more" name="more" :size="16" />
          </button>
        </div>
      </div>

      <div class="sidebar-footer">
        <button class="account-row">
          <span class="avatar">{{ (user?.username || 'U').slice(0, 1).toUpperCase() }}</span>
          <span class="account-copy"><strong>{{ user?.username || 'Workspace' }}</strong><small>{{ user?.email || '本地工作区' }}</small></span>
          <AppIcon name="settings" :size="17" />
        </button>
      </div>
    </aside>

    <main class="main-panel">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button mobile-menu" aria-label="打开侧栏" @click="sidebarOpen = true">
            <AppIcon name="panel" :size="18" />
          </button>
          <div class="title-stack">
            <strong>{{ activeConversation?.title || '新任务' }}</strong>
            <span><AppIcon name="folder" :size="12" /> spring-ai-alibaba-copilot</span>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="branch-pill"><span class="sync-dot" /> 已连接</button>
          <button class="icon-button"><AppIcon name="more" :size="18" /></button>
        </div>
      </header>

      <section class="conversation" :class="{ 'conversation--empty': messages.length === 0 || loadingMessages }">
        <div v-if="loadingMessages" class="empty-state loading-state"><span class="spinner" /><p>正在加载历史消息</p></div>
        <div v-else-if="messages.length === 0" class="empty-state">
          <div class="brand-symbol"><span /> <span /> <span /> <span /></div>
          <h1>今天要构建什么？</h1>
          <p>描述任务，Copilot 会在当前工作区中读取、编辑并验证代码。</p>
        </div>

        <div v-else class="message-stream">
          <div v-for="message in messages" :key="message.id" class="message" :class="`message--${message.role}`">
            <div v-if="message.role === 'assistant'" class="assistant-mark"><span /><span /><span /><span /></div>
            <div class="message-body">
              <div v-if="message.thinking" class="thinking-block">{{ message.thinking }}</div>
              <div v-if="message.text" class="message-text">{{ message.text }}</div>
              <div v-else-if="message.streaming" class="response-loading"><span class="spinner" /> 正在思考</div>
              <div v-if="message.error" class="message-error">{{ message.error }}</div>

              <div v-if="message.operations?.length" class="activity-card">
                <template v-for="operation in message.operations" :key="operation.id">
                  <div v-if="operation.filePath" class="code-change">
                    <div class="code-change-header">
                      <span><AppIcon name="file" :size="14" /> {{ operation.filePath }}</span>
                      <span class="operation-status" :class="`operation-status--${operation.status}`">
                        {{ operation.status === 'done' ? '已完成' : '修改中' }}
                      </span>
                    </div>
                    <div v-if="operation.content" class="change-preview">{{ operation.content }}</div>
                  </div>
                  <div v-else class="activity-row" :class="`activity-row--${operation.status}`">
                    <span v-if="operation.status === 'done'" class="status-icon"><AppIcon name="check" :size="13" :stroke-width="2.4" /></span>
                    <span v-else class="spinner" />
                    <div><strong>{{ operation.command ? '执行命令' : '扫描工作区' }}</strong><small>{{ operation.command || operation.content }}</small></div>
                  </div>
                </template>
              </div>

              <div v-if="message.role === 'assistant'" class="message-tools">
                <button title="复制"><AppIcon name="copy" :size="14" /></button>
                <button title="有帮助"><AppIcon name="thumbsUp" :size="14" /></button>
                <button title="重新生成"><AppIcon name="refresh" :size="14" /></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="composer-wrap">
        <div class="composer">
          <textarea
            ref="composer"
            v-model="prompt"
            rows="1"
            placeholder="让 Copilot 完成一项任务"
            @keydown="handleKeydown"
          />
          <div class="composer-toolbar">
            <div class="composer-options">
              <button class="tool-button" title="添加上下文"><AppIcon name="plus" :size="17" /></button>
              <button class="select-button" @click="menuOpen = menuOpen === 'model' ? false : 'model'">
                {{ selectedModel?.name || '选择模型' }} <span>⌄</span>
              </button>
              <button class="select-button select-button--muted" @click="menuOpen = menuOpen === 'access' ? false : 'access'">
                {{ access }} <span>⌄</span>
              </button>
            </div>
            <button v-if="sending" class="send-button" aria-label="停止" @click="stopMessage">
              <AppIcon name="x" :size="15" :stroke-width="2.2" />
            </button>
            <button v-else class="send-button" :disabled="!prompt.trim() || !selectedModel" aria-label="发送" @click="sendMessage">
              <AppIcon name="send" :size="17" :stroke-width="2.2" />
            </button>
          </div>

          <div v-if="menuOpen === 'model'" class="floating-menu floating-menu--model">
            <div v-if="models.length === 0" class="menu-empty">后端暂无可用模型</div>
            <button v-for="item in models" :key="item.modelConfigId" @click="selectedModelId = String(item.modelConfigId); menuOpen = false">
              <span>{{ item.name }}</span><AppIcon v-if="selectedModelId === String(item.modelConfigId)" name="check" :size="14" />
            </button>
          </div>
          <div v-if="menuOpen === 'access'" class="floating-menu floating-menu--access">
            <button v-for="item in ['工作区访问', '只读模式', '完整访问']" :key="item" @click="access = item; menuOpen = false">
              <span>{{ item }}</span><AppIcon v-if="access === item" name="check" :size="14" />
            </button>
          </div>
        </div>
        <p class="composer-hint">Copilot 可能会犯错，请检查生成的代码和命令。</p>
      </footer>
    </main>

    <div v-if="notice" class="notice">{{ notice }}</div>
  </div>
</template>

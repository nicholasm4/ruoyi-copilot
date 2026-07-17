<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from './components/AppIcon.vue'
import MarkdownView from './components/MarkdownView.vue'
import { authApi, conversationApi, codingApi, modelApi, streamChat, workspaceApi } from './api/client'
import { mapRuoyiEvent } from './api/ruoyiAdapter'

/**
 * 编程能力开关。true = 走 ruoyi-ai 的 /coding/chat（AiServices + 文件/命令工具）。
 * 第一阶段默认 true 对接 ruoyi-ai 基础编程能力。
 */
const useCodingMode = ref(true)
/** ruoyi-ai 模型名称（chat_model 表里的 name）；模型未配时后端会返回 error 事件，通道协议仍可验证 */
const codingModel = ref('deepseek-v4-flash')

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
const workspacePath = ref('')
const workspaceFiles = ref([])
const toolsOpen = ref(false)
const activeTool = ref('files')
const htmlPreviewOpen = ref(false)
const selectedFilePath = ref('')
const fileContent = ref('')
const fileDirty = ref(false)
const fileLoading = ref(false)
const commandInput = ref('')
const commandRunning = ref(false)
const terminalOutput = ref('')
const loadingConversations = ref(false)
const loadingMessages = ref(false)
const creatingConversation = ref(false)
const sending = ref(false)
const notice = ref('')
let abortController = null
const DEMO_CONVERSATION_ID = 'local-demo-task'
let demoStarted = false

/** crypto.randomUUID 仅在 secure context（https 或 localhost）可用，IP 访问时兜底 */
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`)

const selectedModel = computed(() => models.value.find((item) => String(item.modelConfigId) === selectedModelId.value))
const isHtmlFile = computed(() => /\.html?$/i.test(selectedFilePath.value))
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
    const result = useCodingMode.value
      ? await codingApi.workspace(workspacePath.value)
      : await workspaceApi.files()
    workspacePath.value = result?.root || workspacePath.value
    workspaceFiles.value = (result?.files || []).filter((item) => !item.directory)
    workspaceFileCount.value = result?.fileCount ?? Object.keys(result?.files || {}).length
  } catch {
    workspaceFileCount.value = 0
  }
}

async function bootstrap() {
  if (useCodingMode.value) {
    const availableModels = await codingApi.models().catch(() => [])
    models.value = availableModels.map((model) => ({ ...model, modelConfigId: model.id }))
    const preferred = models.value.find((model) => model.name === codingModel.value) || models.value[0]
    if (preferred) {
      selectedModelId.value = String(preferred.modelConfigId)
      codingModel.value = preferred.name
    }
    await loadWorkspace()
    return
  }
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
      id: item.id || uuid(),
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
  if (useCodingMode.value) {
    const id = uuid()
    conversations.value.unshift({ conversationId: id, title: '新任务', messageCount: 0, updatedTime: new Date().toISOString() })
    activeConversationId.value = id
    messages.value = []
    prompt.value = ''
    return
  }
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
  if (eventType === 'error') {
    message.error = data?.content || data?.message || '后端返回错误'
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
    // 状态优先用后端 status；add/edit/delete 的 end 阶段兜底 done，其余默认 running
    const stage = eventType.split('-').pop()
    const fallbackStatus = stage === 'end' ? 'done' : 'running'
    const operation = {
      id: operationId,
      type: eventType,
      filePath: data?.filePath,
      command: data?.command,
      content: data?.content,
      status: data?.status || fallbackStatus,
    }
    if (existing) Object.assign(existing, operation)
    else message.operations.push(operation)
  }
}

async function sendMessage() {
  const text = prompt.value.trim()
  if (!text || sending.value) return
  // 编程能力模式不依赖模型选择器（走 ruoyi-ai chat_model 按名称查）
  if (!useCodingMode.value && !selectedModel.value) {
    showNotice('请先在后端配置可用模型')
    return
  }

  if (!useCodingMode.value && !activeConversationId.value) await newThread()
  if (!useCodingMode.value && !activeConversationId.value) return

  const userMessage = { id: uuid(), role: 'user', text }
  const assistantMessage = { id: uuid(), role: 'assistant', text: '', thinking: '', operations: [], streaming: true }
  messages.value.push(userMessage, assistantMessage)
  prompt.value = ''
  sending.value = true
  menuOpen.value = false
  abortController = new AbortController()

  await nextTick()
  document.querySelector('.conversation')?.scrollTo({ top: 999999, behavior: 'smooth' })

  // 编程能力适配：ruoyi-ai 事件 → applyStreamEvent 卡片协议
  const onEvent = (event) => {
    if (useCodingMode.value) {
      mapRuoyiEvent(event).forEach((e) => applyStreamEvent(assistantMessage, e))
    } else {
      applyStreamEvent(assistantMessage, event)
    }
  }

  try {
    if (useCodingMode.value) {
      await codingApi.chat(text, selectedModel.value?.name || codingModel.value, workspacePath.value, {
        signal: abortController.signal,
        onEvent,
      })
    } else {
      await streamChat({
        message: { id: userMessage.id, role: 'user', content: text, timestamp: new Date().toISOString() },
        modelConfigId: String(selectedModel.value?.modelConfigId || ''),
        conversationId: activeConversationId.value,
        enablePreferences: true,
        enablePreferenceLearning: true,
        tools: [],
      }, {
        signal: abortController.signal,
        onEvent,
      })
      await loadConversations()
    }
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

async function openFile(path) {
  if (fileDirty.value && !window.confirm('当前文件尚未保存，仍要打开其他文件吗？')) return
  fileLoading.value = true
  toolsOpen.value = true
  activeTool.value = 'files'
  try {
    const result = await codingApi.readFile(path, workspacePath.value)
    selectedFilePath.value = result.path
    fileContent.value = result.content
    fileDirty.value = false
  } catch (error) {
    showNotice(error.message)
  } finally {
    fileLoading.value = false
  }
}

async function saveFile() {
  if (!selectedFilePath.value || fileLoading.value) return
  fileLoading.value = true
  try {
    await codingApi.saveFile(selectedFilePath.value, fileContent.value, workspacePath.value)
    fileDirty.value = false
    showNotice('文件已保存')
    await loadWorkspace()
  } catch (error) {
    showNotice(error.message)
  } finally {
    fileLoading.value = false
  }
}

async function runCommand() {
  const command = commandInput.value.trim()
  if (!command || commandRunning.value) return
  commandRunning.value = true
  terminalOutput.value += `\n> ${command}\n`
  try {
    const result = await codingApi.command(command, workspacePath.value)
    terminalOutput.value += `${result.output || '(无输出)'}\n`
    commandInput.value = ''
    await loadWorkspace()
  } catch (error) {
    terminalOutput.value += `错误: ${error.message}\n`
  } finally {
    commandRunning.value = false
  }
}

function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

onMounted(async () => {
  const token = localStorage.getItem('token')
  if (token && !useCodingMode.value) {
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

        <section class="workspace-card" @click="toolsOpen = true; activeTool = 'files'">
          <div class="workspace-heading">
            <span class="workspace-mark">A</span>
            <div>
              <strong>ruoyi-copilot</strong>
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
            <span><AppIcon name="folder" :size="12" /> ruoyi-copilot</span>
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
              <div v-if="message.text" class="message-text"><MarkdownView :content="message.text" /></div>
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
            <button v-else class="send-button" :disabled="!prompt.trim() || (!useCodingMode && !selectedModel)" aria-label="发送" @click="sendMessage">
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

    <aside v-if="toolsOpen" class="tool-drawer">
      <div class="tool-drawer-header">
        <div class="tool-tabs">
          <button :class="{ active: activeTool === 'files' }" @click="activeTool = 'files'">文件</button>
          <button :class="{ active: activeTool === 'terminal' }" @click="activeTool = 'terminal'">终端</button>
        </div>
        <button class="tool-close" title="关闭" @click="toolsOpen = false">×</button>
      </div>
      <template v-if="activeTool === 'files'">
        <div class="workspace-root" :title="workspacePath">{{ workspacePath || '正在连接工作区…' }}</div>
        <div class="file-browser">
          <button v-for="file in workspaceFiles" :key="file.path" :class="{ active: selectedFilePath === file.path }" @click="openFile(file.path)">
            <AppIcon name="file" :size="13" /><span>{{ file.path }}</span>
          </button>
        </div>
        <div class="editor-pane">
          <div class="editor-header">
            <span>{{ selectedFilePath || '选择一个文本文件' }}{{ fileDirty ? ' •' : '' }}</span>
            <div class="editor-actions">
              <button v-if="isHtmlFile" :disabled="!selectedFilePath || fileLoading" @click="htmlPreviewOpen = true">预览</button>
              <button :disabled="!selectedFilePath || !fileDirty || fileLoading" @click="saveFile">保存</button>
            </div>
          </div>
          <textarea v-model="fileContent" :disabled="!selectedFilePath || fileLoading" spellcheck="false" placeholder="从上方文件列表选择文件" @input="fileDirty = true" @keydown.ctrl.s.prevent="saveFile" />
        </div>
      </template>
      <template v-else>
        <pre class="terminal-output">{{ terminalOutput || '受控终端：支持 npm、pnpm、git、mvn、java、python、node 等白名单命令。' }}</pre>
        <form class="terminal-input" @submit.prevent="runCommand">
          <span>&gt;</span>
          <input v-model="commandInput" :disabled="commandRunning" autocomplete="off" placeholder="npm run build" />
          <button :disabled="!commandInput.trim() || commandRunning">{{ commandRunning ? '执行中' : '运行' }}</button>
        </form>
      </template>
    </aside>

    <div v-if="htmlPreviewOpen" class="html-preview-overlay" @click.self="htmlPreviewOpen = false">
      <div class="html-preview-modal">
        <div class="html-preview-header">
          <span>{{ selectedFilePath }}</span>
          <button class="html-preview-close" title="关闭" @click="htmlPreviewOpen = false">×</button>
        </div>
        <iframe class="html-preview-frame" :srcdoc="fileContent" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
      </div>
    </div>

    <div v-if="notice" class="notice">{{ notice }}</div>
  </div>
</template>

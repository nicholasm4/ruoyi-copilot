<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import type { LoginCredentials, LoginOptions } from '../api/authApi'

interface Props {
  options: LoginOptions
  submitting: boolean
  optionsLoading: boolean
  error: string
}

interface Emits {
  submit: [credentials: LoginCredentials]
  refreshOptions: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const passwordVisible = shallowRef(false)
const form = reactive<LoginCredentials>({
  username: 'admin',
  password: 'admin123',
  tenantId: '',
  code: '',
  uuid: '',
})

watch(
  () => props.options,
  (options) => {
    if (!form.tenantId || !options.tenants.some((tenant) => tenant.tenantId === form.tenantId)) {
      form.tenantId = options.tenants[0]?.tenantId ?? '000000'
    }
    form.uuid = options.captchaUuid
    if (options.captchaEnabled) form.code = ''
  },
  { immediate: true },
)

const captchaSource = computed(() => {
  const image = props.options.captchaImage
  if (!image) return ''
  return image.startsWith('data:') ? image : `data:image/png;base64,${image}`
})

function submit(): void {
  emit('submit', {
    username: form.username.trim(),
    password: form.password,
    tenantId: form.tenantId,
    code: props.options.captchaEnabled ? form.code?.trim() : undefined,
    uuid: props.options.captchaEnabled ? form.uuid : undefined,
  })
}
</script>

<template>
  <main class="login-page">
    <header class="auth-header">
      <div class="auth-brand">
        <span class="auth-brand-mark"><AppIcon name="terminal" :size="16" :stroke-width="2" /></span>
        <span>RuoYi Copilot</span>
      </div>
      <div class="auth-environment">
        <span class="auth-status-dot" />
        <span>企业工作区</span>
      </div>
    </header>

    <section class="auth-content" aria-labelledby="login-title">
      <div class="auth-card">
        <div class="auth-product-icon" aria-hidden="true">
          <AppIcon name="terminal" :size="21" :stroke-width="1.8" />
        </div>
        <div class="auth-heading">
          <h1 id="login-title">登录 RuoYi Copilot</h1>
          <p>输入企业账号以访问你的编程工作区。</p>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <label v-if="options.tenantEnabled" class="auth-field">
            <span>租户</span>
            <span class="auth-control auth-select-wrap">
              <select v-model="form.tenantId" required :disabled="optionsLoading || submitting">
                <option v-for="tenant in options.tenants" :key="tenant.tenantId" :value="tenant.tenantId">
                  {{ tenant.companyName }} · {{ tenant.tenantId }}
                </option>
              </select>
              <AppIcon name="chevron" :size="14" />
            </span>
          </label>

          <label class="auth-field">
            <span>账号</span>
            <span class="auth-control">
              <input
                v-model="form.username"
                name="username"
                type="text"
                autocomplete="username"
                placeholder="请输入账号"
                required
                minlength="2"
                autofocus
                :disabled="submitting"
              />
            </span>
          </label>

          <label class="auth-field">
            <span>密码</span>
            <span class="auth-control auth-password">
              <input
                v-model="form.password"
                name="password"
                :type="passwordVisible ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入密码"
                required
                minlength="5"
                :disabled="submitting"
              />
              <button
                type="button"
                :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                @click="passwordVisible = !passwordVisible"
              >
                {{ passwordVisible ? '隐藏' : '显示' }}
              </button>
            </span>
          </label>

          <label v-if="options.captchaEnabled" class="auth-field">
            <span>验证码</span>
            <span class="auth-control auth-captcha">
              <input
                v-model="form.code"
                name="captcha"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="请输入计算结果"
                required
                :disabled="submitting"
              />
              <button type="button" aria-label="刷新验证码" @click="emit('refreshOptions')">
                <img v-if="captchaSource" :src="captchaSource" alt="验证码" />
                <span v-else>刷新</span>
              </button>
            </span>
          </label>

          <div v-if="error" class="auth-error" role="alert">
            <AppIcon name="x" :size="15" />
            <span>{{ error }}</span>
          </div>

          <button class="login-submit auth-submit" type="submit" :disabled="submitting || optionsLoading">
            <span v-if="submitting" class="spinner" />
            <span>{{ submitting ? '正在登录…' : '登录' }}</span>
          </button>
        </form>

        <button
          v-if="optionsLoading || (options.tenantEnabled && options.tenants.length === 0)"
          class="auth-retry"
          type="button"
          :disabled="optionsLoading"
          @click="emit('refreshOptions')"
        >
          {{ optionsLoading ? '正在读取登录配置…' : '重新读取登录配置' }}
        </button>

        <div class="auth-security-note">
          <AppIcon name="check" :size="14" />
          <span>安全连接 · 登录状态仅保存在当前浏览器</span>
        </div>
      </div>
    </section>

    <footer class="auth-footer">
      <span>RuoYi AI</span>
      <span>API · localhost:6039</span>
    </footer>
  </main>
</template>

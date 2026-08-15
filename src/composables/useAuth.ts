import { onScopeDispose, readonly, shallowRef } from 'vue'
import * as authApi from '../api/authApi'
import {
  AUTH_REQUIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../api/http'
import type { LoginCredentials, LoginOptions } from '../api/authApi'

const emptyOptions: LoginOptions = {
  tenantEnabled: false,
  tenants: [],
  captchaEnabled: false,
  captchaUuid: '',
  captchaImage: '',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useAuth() {
  const _ready = shallowRef(false)
  const _authenticated = shallowRef(Boolean(getAuthToken()))
  const _submitting = shallowRef(false)
  const _optionsLoading = shallowRef(false)
  const _error = shallowRef('')
  const _options = shallowRef<LoginOptions>(emptyOptions)
  const _userName = shallowRef(globalThis.localStorage?.getItem('harness.username') ?? '')

  async function refreshLoginOptions(): Promise<void> {
    if (_optionsLoading.value) return
    _optionsLoading.value = true
    try {
      _options.value = await authApi.loadLoginOptions()
    } catch (error) {
      _error.value = `无法加载登录配置：${errorMessage(error)}`
    } finally {
      _optionsLoading.value = false
    }
  }

  async function initialize(): Promise<void> {
    if (!_authenticated.value) await refreshLoginOptions()
    _ready.value = true
  }

  async function signIn(credentials: LoginCredentials): Promise<void> {
    if (_submitting.value) return
    _submitting.value = true
    _error.value = ''
    try {
      const token = await authApi.login(credentials)
      setAuthToken(token)
      _userName.value = credentials.username
      globalThis.localStorage?.setItem('harness.username', credentials.username)
      _authenticated.value = true
    } catch (error) {
      _error.value = errorMessage(error)
      if (_options.value.captchaEnabled) await refreshLoginOptions()
    } finally {
      _submitting.value = false
    }
  }

  async function signOut(): Promise<void> {
    try {
      if (getAuthToken()) await authApi.logout()
    } catch {
      // Local logout must still complete if the token has already expired.
    } finally {
      clearAuthToken()
      _userName.value = ''
      globalThis.localStorage?.removeItem('harness.username')
      _authenticated.value = false
      _error.value = ''
      await refreshLoginOptions()
    }
  }

  function handleAuthRequired(): void {
    clearAuthToken()
    _authenticated.value = false
    _error.value = '登录状态已失效，请重新登录'
    void refreshLoginOptions()
  }

  globalThis.addEventListener?.(AUTH_REQUIRED_EVENT, handleAuthRequired)
  onScopeDispose(() => globalThis.removeEventListener?.(AUTH_REQUIRED_EVENT, handleAuthRequired))

  return {
    ready: readonly(_ready),
    authenticated: readonly(_authenticated),
    submitting: readonly(_submitting),
    optionsLoading: readonly(_optionsLoading),
    error: readonly(_error),
    options: readonly(_options),
    userName: readonly(_userName),
    initialize,
    refreshLoginOptions,
    signIn,
    signOut,
  }
}

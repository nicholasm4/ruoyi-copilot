<script setup lang="ts">
import { onMounted } from 'vue'
import WorkspaceAgentView from './views/WorkspaceAgentView.vue'
import LoginView from './views/LoginView.vue'
import { useAuth } from './composables/useAuth'
import type { LoginCredentials } from './api/authApi'

const auth = useAuth()

function signIn(credentials: LoginCredentials): void {
  void auth.signIn(credentials)
}

onMounted(() => {
  void auth.initialize()
})
</script>

<template>
  <div v-if="!auth.ready.value" class="auth-bootstrap" aria-live="polite">
    <div class="brand-symbol brand-symbol--large"><i /><i /><i /><i /></div>
    <span>正在初始化安全会话…</span>
  </div>
  <WorkspaceAgentView
    v-else-if="auth.authenticated.value"
    :user-name="auth.userName.value"
    @logout="auth.signOut"
  />
  <LoginView
    v-else
    :options="auth.options.value"
    :submitting="auth.submitting.value"
    :options-loading="auth.optionsLoading.value"
    :error="auth.error.value"
    @submit="signIn"
    @refresh-options="auth.refreshLoginOptions"
  />
</template>

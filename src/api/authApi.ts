import { requestJson } from './http'

export interface TenantOption {
  tenantId: string
  companyName: string
}

export interface LoginOptions {
  tenantEnabled: boolean
  tenants: readonly TenantOption[]
  captchaEnabled: boolean
  captchaUuid: string
  captchaImage: string
}

export interface LoginCredentials {
  username: string
  password: string
  tenantId: string
  code?: string
  uuid?: string
}

interface TenantResponse {
  tenantEnabled?: boolean
  voList?: TenantOption[]
}

interface CaptchaResponse {
  captchaEnabled?: boolean
  uuid?: string
  img?: string
}

interface LoginResponse {
  access_token?: string
  token?: string
}

const defaultClientId = 'e5cd7e4891bf95d1d19206ce24a7b32e'

function clientId(): string {
  return import.meta.env.VITE_CLIENT_ID?.trim() || defaultClientId
}

export async function loadLoginOptions(): Promise<LoginOptions> {
  const [tenant, captcha] = await Promise.all([
    requestJson<TenantResponse>('/auth/tenant/list'),
    requestJson<CaptchaResponse>('/auth/code'),
  ])
  return {
    tenantEnabled: Boolean(tenant.tenantEnabled),
    tenants: tenant.voList ?? [],
    captchaEnabled: Boolean(captcha.captchaEnabled),
    captchaUuid: captcha.uuid ?? '',
    captchaImage: captcha.img ?? '',
  }
}

export async function login(credentials: LoginCredentials): Promise<string> {
  const response = await requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      ...credentials,
      clientId: clientId(),
      grantType: 'password',
    }),
  })
  const token = response.access_token ?? response.token
  if (!token) throw new Error('登录响应中缺少访问令牌')
  return token
}

export function logout(): Promise<void> {
  return requestJson<void>('/auth/logout', { method: 'POST' })
}

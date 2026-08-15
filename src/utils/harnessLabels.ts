import type { HarnessApprovalPolicy, HarnessPermissionMode } from '../types/harness'

const permissionLabels: Record<HarnessPermissionMode, string> = {
  READ_ONLY: '只读',
  WORKSPACE_WRITE: '工作区写入',
  FULL_ACCESS: '完整访问',
}

export function permissionModeLabel(mode: HarnessPermissionMode): string {
  return permissionLabels[mode]
}

const approvalLabels: Record<HarnessApprovalPolicy, string> = {
  ON_REQUEST: '按需审批',
  NEVER: '全自动',
}

export function approvalPolicyLabel(policy: HarnessApprovalPolicy): string {
  return approvalLabels[policy]
}

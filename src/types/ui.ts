import type { HarnessMessageRole } from './harness'

export interface DisplayMessage {
  id: string
  role: HarnessMessageRole
  content: string
  thinking: string
  toolName?: string
  toolCallId?: string
  toolError?: boolean
  timestamp: number
  streaming?: boolean
}

export interface DisplayToolActivity {
  toolCallId: string
  toolName: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  arguments?: string
  content?: string
  code?: string
  timestamp: number
}

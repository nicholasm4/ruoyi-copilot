export function createId(prefix = 'id'): string {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${value}`
}

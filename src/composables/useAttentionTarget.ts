import { nextTick, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, ShallowRef } from 'vue'

interface UseAttentionTargetOptions {
  behavior?: ScrollBehavior
  block?: ScrollLogicalPosition
}

export function useAttentionTarget(
  target: Readonly<ShallowRef<HTMLElement | null>>,
  attentionKey: MaybeRefOrGetter<string | null>,
  options: UseAttentionTargetOptions = {},
): void {
  watch(
    () => toValue(attentionKey),
    async (key, previousKey, onCleanup) => {
      if (!key || key === previousKey) return

      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      await nextTick()
      if (cancelled) return

      const element = target.value
      if (!element) return
      const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : (options.behavior ?? 'smooth'),
        block: options.block ?? 'center',
        inline: 'nearest',
      })

      if (!(element instanceof HTMLButtonElement) || !element.disabled) {
        element.focus({ preventScroll: true })
      }
    },
    { immediate: true },
  )
}

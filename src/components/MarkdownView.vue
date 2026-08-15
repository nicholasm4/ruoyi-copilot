<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { renderMarkdown } from '../utils/markdown'

interface Props {
  content?: string
}

const props = withDefaults(defineProps<Props>(), { content: '' })
const root = useTemplateRef<HTMLDivElement>('root')
const html = computed(() => renderMarkdown(props.content))

function onClick(event: Event): void {
  if (!(event.target instanceof Element)) return
  const button = event.target.closest<HTMLButtonElement>('[data-action="toggle-preview"]')
  const wrap = button?.closest<HTMLElement>('.code-block-wrap')
  if (!button || !wrap) return
  const existing = wrap.querySelector('.code-preview-frame')
  if (existing) {
    existing.remove()
    button.textContent = '预览'
    button.classList.remove('is-active')
    return
  }
  const frame = document.createElement('iframe')
  frame.className = 'code-preview-frame'
  frame.setAttribute('sandbox', '')
  frame.srcdoc = decodeURIComponent(button.dataset.code ?? '')
  wrap.append(frame)
  button.textContent = '收起预览'
  button.classList.add('is-active')
}

onMounted(() => root.value?.addEventListener('click', onClick))
onBeforeUnmount(() => root.value?.removeEventListener('click', onClick))
</script>

<template>
  <!-- MarkdownIt runs with html=false; generated markup contains escaped user source. -->
  <div ref="root" class="markdown-view" v-html="html" />
</template>

<style>
.code-block-wrap { position: relative; }
.code-preview-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  opacity: 0;
}
.code-block-wrap--previewable:hover .code-preview-btn,
.code-preview-btn.is-active { opacity: 1; }
.code-preview-frame {
  display: block;
  width: 100%;
  min-height: 160px;
  margin-top: 8px;
  border: 1px solid #d8d8df;
  border-radius: 8px;
  background: #fff;
}
</style>

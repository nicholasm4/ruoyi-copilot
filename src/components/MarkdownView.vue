<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

/**
 * Markdown 渲染：markdown-it + highlight.js 代码高亮。
 * 流式场景下每帧重新 render，量小可接受；转义由 markdown-it 处理，XSS 安全。
 *
 * html/xml 代码块额外提供"预览"按钮：点击后用 sandbox iframe（srcdoc，禁脚本）
 * 把原代码渲染成实际效果。原始代码经 encodeURIComponent 存在 data-code，按钮事件委托处理。
 */
const props = defineProps({
  content: { type: String, default: '' },
})

const root = ref(null)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : ''
    let value
    if (language) {
      try {
        value = hljs.highlight(code, { language, ignoreIllegals: true }).value
      } catch {
        value = md.utils.escapeHtml(code)
      }
    } else {
      value = md.utils.escapeHtml(code)
    }
    const isHtml = language === 'html' || language === 'xml'
    const button = isHtml
      ? `<button class="code-preview-btn" data-action="toggle-preview" data-code="${encodeURIComponent(code)}" type="button">预览</button>`
      : ''
    const wrapClass = isHtml ? 'code-block-wrap code-block-wrap--previewable' : 'code-block-wrap'
    return `<div class="${wrapClass}">${button}<pre class="code-block"><code class="hljs${language ? ` language-${language}` : ''}">${value}</code></pre></div>`
  },
})

const html = computed(() => md.render(props.content || ''))

function onClick(event) {
  const btn = event.target.closest('[data-action="toggle-preview"]')
  if (!btn) return
  const wrap = btn.closest('.code-block-wrap')
  if (!wrap) return
  const existing = wrap.querySelector('.code-preview-frame')
  if (existing) {
    existing.remove()
    btn.textContent = '预览'
    btn.classList.remove('is-active')
    return
  }
  const code = decodeURIComponent(btn.dataset.code || '')
  const frame = document.createElement('iframe')
  frame.className = 'code-preview-frame'
  // sandbox 留空：禁止脚本、表单提交、同源导航等，只渲染静态 HTML/CSS
  frame.setAttribute('sandbox', '')
  frame.setAttribute('srcdoc', code)
  wrap.appendChild(frame)
  btn.textContent = '收起预览'
  btn.classList.add('is-active')
}

onMounted(() => {
  root.value?.addEventListener('click', onClick)
})
onBeforeUnmount(() => {
  root.value?.removeEventListener('click', onClick)
})
</script>

<template>
  <div ref="root" class="markdown-view" v-html="html" />
</template>

<style>
.code-block-wrap {
  position: relative;
}
.code-preview-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  font-size: 12px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.code-block-wrap--previewable:hover .code-preview-btn,
.code-preview-btn.is-active {
  opacity: 1;
}
.code-preview-btn.is-active {
  background: rgba(99, 166, 255, 0.16);
  border-color: rgba(99, 166, 255, 0.5);
}
.code-preview-frame {
  width: 100%;
  min-height: 120px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  background: #fff;
  margin-top: 8px;
  display: block;
}
</style>

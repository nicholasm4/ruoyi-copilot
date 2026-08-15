import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const languages = {
  bash,
  shell: bash,
  css,
  java,
  javascript,
  js: javascript,
  json,
  markdown,
  md: markdown,
  python,
  py: python,
  sql,
  typescript,
  ts: typescript,
  html: xml,
  xml,
  vue: xml,
  yaml,
  yml: yaml,
}

Object.entries(languages).forEach(([name, definition]) => hljs.registerLanguage(name, definition))

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code: string, lang: string): string {
    const language = lang && hljs.getLanguage(lang) ? lang : ''
    let value = escapeHtml(code)
    if (language) {
      try {
        value = hljs.highlight(code, { language, ignoreIllegals: true }).value
      } catch {
        value = escapeHtml(code)
      }
    }
    const isHtml = language === 'html' || language === 'xml'
    const button = isHtml
      ? `<button class="code-preview-btn" data-action="toggle-preview" data-code="${encodeURIComponent(code)}" type="button">预览</button>`
      : ''
    const wrapClass = isHtml ? 'code-block-wrap code-block-wrap--previewable' : 'code-block-wrap'
    return `<div class="${wrapClass}">${button}<pre class="code-block"><code class="hljs${language ? ` language-${language}` : ''}">${value}</code></pre></div>`
  },
})

/** Shared renderer avoids rebuilding MarkdownIt and language grammars for every message row. */
export function renderMarkdown(content: string): string {
  return renderer.render(content)
}

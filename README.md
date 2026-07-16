# ruoyi-copilot

基于 Vue 3 + Vite 的 Copilot 前端 UI，对接 Spring AI Alibaba 后端（会话、模型、工作区、流式对话）。

## 技术栈

- Vue 3 (`<script setup>`)
- Vite 7
- 原生流式对话（SSE / fetch stream）

## 开发

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

后端代理默认指向 `http://localhost:6039`，见 `vite.config.js`。

## License

[MIT](./LICENSE)

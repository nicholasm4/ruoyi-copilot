import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const target = process.env.VITE_API_TARGET || 'http://localhost:6039'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['.monkeycode-ai.online'],
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
      },
      '/auth': {
        target,
        changeOrigin: true,
      },
      '/coding': {
        target,
        changeOrigin: true,
      },
    },
  },
})


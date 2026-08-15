import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const target = process.env.VITE_API_TARGET || 'http://localhost:6039'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Bind IPv4 explicitly. On Windows, localhost may resolve to ::1 first and
    // hit another IPv6-only service that happens to use the same port.
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    allowedHosts: ['.monkeycode-ai.online'],
    proxy: {
      '/api': { target, changeOrigin: true },
      '/auth': { target, changeOrigin: true },
      '/coding': { target, changeOrigin: true },
      '/system': { target, changeOrigin: true },
    },
  },
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    // 开服时就用 esbuild 预打包这些大依赖，避免边加载边发现、触发二次预构建和整页刷新（冷启动更快）
    include: ['vue', 'pinia', 'sql.js', 'lz-string'],
    // transformers.js 体积巨大且本地推理用，保持排除，不让它进预构建
    exclude: ['@huggingface/transformers']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@src': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src'),
      '@scripts': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src/scripts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,  // start.bat 负责打开浏览器，避免重复打开页面
    // 关闭HMR日志
    hmr: {
      overlay: false
    },
    // 预热职责已收敛到 scripts/warm-dev-server.mjs 独占；这里不得再恢复全量 glob（会导致启动前 HTTP 零字节挂起）。
    // 开发时把 /api、/avatars 和 /personality-models 请求代理到 Express
    // /personality-models 是人格模型 ONNX 包的静态下发目录，浏览器本地推理要从这里拉模型文件；
    // 不代理会落到 SPA fallback 返回 index.html，导致 transformers.js 解析模型 JSON 时报 "Unexpected token '<'"。
    // /ort-wasm 是 ONNX wasm 运行时的本站下发路由，与 /personality-models 同理：不代理会落到 SPA fallback。
    // /chat-images 是聊天上传图片的静态下发目录，与上面同理：不代理会落到 SPA fallback 导致 dev 环境图片裂图。
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/avatars': 'http://127.0.0.1:3000',
      '/chat-images': 'http://127.0.0.1:3000',
      '/personality-models': 'http://127.0.0.1:3000',
      '/ort-wasm': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: 'dist',  // 构建产物放在 dist/，Express 会托管这个目录
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (!normalizedId.includes('node_modules')) {
            if (normalizedId.includes('/src/composables/app/useAppShellPanelBuilders.ts')) return 'app-shell-panel-builders'
            if (normalizedId.includes('/src/composables/app/useAppShellAssemblers.ts')) return 'app-shell-assemblers'
            if (normalizedId.includes('/src/composables/app/workspaceCommandHandlers.ts')) return 'app-shell-command-handlers'
            return
          }
          if (normalizedId.includes('/@huggingface/transformers/')) return 'vendor-transformers'
          if (normalizedId.includes('/vue/') || normalizedId.includes('/@vue/')) return 'vendor-vue'
          if (normalizedId.includes('/pinia/')) return 'vendor-pinia'
          if (normalizedId.includes('/sql.js/')) return 'vendor-sqljs'
          if (normalizedId.includes('/lz-string/')) return 'vendor-utils'
          return 'vendor'
        }
      }
    }
  }
})

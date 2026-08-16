import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const serverTestFiles = [
  'tests/unit/server/**/*.spec.js',
  'tests/unit/server/**/*.test.js',
  'server/**/*.spec.js',
  'server/**/*.test.js'
]

const browserTestFiles = [
  'tests/**/*.spec.js',
  'tests/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/*.test.js'
]

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,  // 允许全局使用 describe, it, expect 等
    projects: [
      {
        extends: true,
        test: {
          name: 'server-node',
          environment: 'node',
          include: serverTestFiles
        }
      },
      {
        extends: true,
        test: {
          name: 'browser-jsdom',
          environment: 'jsdom',
          setupFiles: ['tests/setup/browser.ts'],
          include: browserTestFiles,
          exclude: ['tests/unit/server/**/*']
        }
      }
    ],
    // 测试文件别名
    alias: {
      '@': resolve(__dirname, 'src'),
      '@src': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src'),
      '@scripts': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src/scripts')
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@src': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src'),
      '@scripts': resolve(__dirname, 'src/vendor/vanilla-calendar-pro/src/scripts')
    }
  }
})

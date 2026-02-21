import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const appVersion = process.env.VITE_APP_VERSION || pkg.version || 'dev'


export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: '/', // ✅ ВАЖНО
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})

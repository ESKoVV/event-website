import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const appVersion = process.env.VITE_APP_VERSION || pkg.version || 'dev'

let commitName = ''
try {
  commitName = execSync('git log -1 --pretty=%s', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch {
  commitName = ''
}


export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_APP_COMMIT_NAME': JSON.stringify(process.env.VITE_APP_COMMIT_NAME || commitName)
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

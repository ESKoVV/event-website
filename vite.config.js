import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/event-website/', // Важно: имя вашего репозитория
  build: {
    outDir: 'dist'
  }
})
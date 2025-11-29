import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/event-website/', // Замените 'event-website' на имя вашего репозитория
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
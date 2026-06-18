import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  esbuild: {
    // 本番ビルド時に console.* と debugger を自動除去
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))

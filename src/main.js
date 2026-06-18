import { createApp } from 'vue'
import './assets/css/index.css'
import App from './App.vue'
import { state, actions } from './store'

// 開発時のみ、デバッグ/メンテナンス用にストアをグローバル公開（本番ビルドでは無効）
if (import.meta.env.DEV) {
  window.__store = { state, actions }
}

createApp(App).mount('#app')

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// COOP/COEP bật crossOriginIsolated => onnxruntime-web dùng được WASM đa luồng
// (nhanh 3-4x trên CPU). 'credentialless' để vẫn tải được model từ HuggingFace/CDN.
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})

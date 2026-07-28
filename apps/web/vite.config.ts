/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom para todos: os testes de módulo puro não se importam, e os de página
    // (BL-08) não rodam sem DOM.
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  server: {
    port: 5173,
    // O front chama sempre `/api/...` e o dev server repassa para a API. Em
    // container (API_URL=http://api:3000) muda só a variável.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

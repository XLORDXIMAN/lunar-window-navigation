import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  build: {
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), moon3d: resolve(import.meta.dirname, '3d.html'), models: resolve(import.meta.dirname, 'models.html') } },
    chunkSizeWarningLimit: 1200,
    target: 'es2022',
  },
  plugins: [react(), tailwindcss()],
})

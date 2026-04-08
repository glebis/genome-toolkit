import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Use 127.0.0.1 explicitly — 'localhost' resolves to ::1 (IPv6) on macOS,
      // which can collide with Docker Desktop also listening on port 8000.
      '/api': 'http://127.0.0.1:8000',
    },
  },
})

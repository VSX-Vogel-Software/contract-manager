import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Proxy-Ziel: im Container das Backend im Docker-Netz; fuer `vite preview`
// auf dem Host (schnelle E2E-Laeufe gegen den Build) VITE_PROXY_TARGET=http://localhost:4001
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://backend:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    // Bind-Mount vom Windows-Host liefert keine inotify-Ereignisse; ohne
    // Polling serviert Vite nach einer Aenderung stumm den alten Stand.
    watch: process.env.VITE_USE_POLLING === '1' ? { usePolling: true, interval: 300 } : undefined,
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
    proxy: {
      '/graphql': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Anmeldung ueber Entra ID: zwei Browser-Umleitungen im Backend.
      // changeOrigin bleibt aus - das Backend baut aus dem Host-Header die
      // Rueckkehradresse, und die muss zum Browser zeigen, nicht ins
      // Containernetz.
      '/auth': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/media': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/oauth': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/.well-known': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/mcp': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})

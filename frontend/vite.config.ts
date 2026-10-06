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
  build: {
    rollupOptions: {
      output: {
        // Grosse, selten geaenderte Bibliotheken in feste Chunks buendeln:
        // sonst verteilt Rollup sie auf Dutzende Mini-Chunks der lazy
        // geladenen Seiten (Request-Wasserfall auf dem Handy), und ihre
        // Hashes bleiben ueber Deploys stabil (Browser-Cache).
        manualChunks(id) {
          // Gemeinsame Helfer (CommonJS-Interop, tslib) in den Basis-Chunk -
          // sonst landen sie im ersten Chunk, der sie braucht (z. B. apollo),
          // und react <-> apollo importieren sich gegenseitig: zirkulaere
          // Chunks, React ist beim Start von Apollo noch nicht initialisiert.
          if (id.includes('commonjsHelpers')) return 'react'
          if (!id.includes('node_modules')) return undefined
          const pkg = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id.slice(id.lastIndexOf('node_modules')))?.[1]?.replace('\\', '/')
          if (!pkg) return undefined
          if (/^(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router|tslib)$/.test(pkg)) return 'react'
          if (/^(@apollo\/client|graphql|@wry\/.+|optimism|zen-observable|zen-observable-ts|ts-invariant|symbol-observable|rehackt|graphql-tag)$/.test(pkg)) return 'apollo'
          if (/^(@radix-ui\/.+|@floating-ui\/.+|react-remove-scroll|react-remove-scroll-bar|aria-hidden|react-style-singleton|use-callback-ref|use-sidecar|get-nonce)$/.test(pkg)) return 'radix'
          // Icons: sonst je Icon ein eigener Mini-Chunk
          if (pkg === 'lucide-react') return 'icons'
          return undefined
        },
        // Kleine gemeinsame Chunks (UI-Bausteine, Hilfsfunktionen) in ihre
        // Nutzer einfalten - spart Requests, aendert nichts an der Ausfuehrung
        experimentalMinChunkSize: 20_000,
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    // Bind-Mount vom Windows-Host liefert keine inotify-Ereignisse; ohne
    // Polling serviert Vite nach einer Aenderung stumm den alten Stand.
    // Polling kostet je Durchlauf einen stat() pro Datei - Test- und
    // Build-Ausgaben (tausende Bildschirmfotos) deshalb ausnehmen, sonst
    // frisst der Container im Leerlauf eine halbe CPU.
    watch:
      process.env.VITE_USE_POLLING === '1'
        ? {
            usePolling: true,
            interval: 1000,
            binaryInterval: 3000,
            ignored: [
              '**/dist*/**',
              '**/mobile-screens*/**',
              '**/test-results*/**',
              '**/playwright-report/**',
              '**/playwright/.auth/**',
              '**/e2e/**',
            ],
          }
        : undefined,
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

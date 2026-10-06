import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ApolloProvider } from '@apollo/client'
import App, { preloadRoute } from './App'
import { apolloClient } from './lib/apollo'
import { AuthProvider } from './lib/auth'
import { Toaster } from './components/Toaster'
import { i18nReady } from './lib/i18n'
import { reloadOnceForChunkError } from './lib/chunkReload'
import './index.css'

// Vite meldet fehlgeschlagene Vorab-Ladungen (z. B. alter Chunk-Hash nach
// einem Deploy) als Ereignis: dann einmal neu laden. Kein preventDefault -
// der Import soll trotzdem scheitern, sonst liefert er `undefined` statt des
// Moduls. Die ChunkErrorBoundary zeigt waehrenddessen die Ladeanzeige bzw.,
// wenn es nach dem Neuladen wieder scheitert, einen Hinweis.
window.addEventListener('vite:preloadError', () => {
  reloadOnceForChunkError()
})

// Seiten-Chunk parallel zur Sprachdatei anstossen
preloadRoute(window.location.pathname)

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ApolloProvider client={apolloClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </ApolloProvider>
    </React.StrictMode>,
  )
}

// Erst rendern, wenn die Sprache geladen ist - sonst blitzen Schluessel auf.
// Schlaegt das Laden fehl, trotzdem rendern (lieber Schluessel als nichts).
i18nReady.finally(render)

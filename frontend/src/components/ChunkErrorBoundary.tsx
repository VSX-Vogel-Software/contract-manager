import { Component, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { isChunkLoadError, isReloading, reloadOnceForChunkError } from '@/lib/chunkReload'

function ChunkErrorNotice() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center" data-testid="chunk-error">
      <p className="text-sm text-gray-700">{t('updateBanner.chunkError')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        <RefreshCw className="h-4 w-4" />
        {t('updateBanner.reload')}
      </button>
    </div>
  )
}

interface Props {
  children: ReactNode
  /** Wechselt der Schluessel (z. B. Pfad), wird der Fehlerzustand verworfen */
  resetKey?: string
}

interface State {
  error: unknown
}

/**
 * Faengt Nachladefehler von lazy() geladenen Seiten ab: einmal automatisch
 * neu laden, sonst Hinweis mit Knopf. Andere Fehler werden weitergereicht.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    // Schon hier (vor dem Rendern) neu laden, damit der Hinweis nicht kurz aufblitzt
    if (isChunkLoadError(error) && !isReloading()) reloadOnceForChunkError()
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (error) {
      if (isChunkLoadError(error)) return isReloading() ? <PageLoading /> : <ChunkErrorNotice />
      // Kein Chunk-Fehler: nicht verschlucken
      throw error
    }
    return this.props.children
  }
}

/**
 * Dezente Ladeanzeige, solange eine Seite nachgeladen wird. Erscheint erst
 * nach kurzer Verzoegerung, damit schnelle Wechsel nicht flackern.
 */
export function PageLoading() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return <div data-testid="page-loading" />
  return (
    <div className="flex justify-center py-12" role="status" aria-live="polite" data-testid="page-loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}

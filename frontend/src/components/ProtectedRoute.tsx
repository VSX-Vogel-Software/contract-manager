import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { useAuth } from '../lib/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, connectionError, retryAuth } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  // Server nicht erreichbar: nicht zum Login schicken - die Anmeldung ist
  // noch gueltig, nur die Verbindung fehlt (Funkloch, Server neu gestartet)
  if (connectionError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center" data-testid="auth-connection-error">
        <WifiOff className="h-10 w-10 text-gray-400" />
        <div>
          <p className="font-medium text-gray-900">{t('auth.connectionError')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('auth.connectionErrorHint')}</p>
        </div>
        <button
          type="button"
          onClick={retryAuth}
          className="h-11 rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('auth.retry')}
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

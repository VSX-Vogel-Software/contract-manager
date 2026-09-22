/**
 * Zentrale Fehlerbehandlung fuer Apollo.
 *
 * Regel: Was niemand behandelt, landet im Toast. Formular- und
 * Validierungsfehler bleiben inline am Feld — wer sie dort anzeigt, setzt
 * `context: { suppressErrorToast: true }` an der Operation. Der Auth-Fall
 * navigiert und toastet nicht.
 */
import i18n from 'i18next'
import { pushToast } from './toastStore'

const AUTH_ERROR_MESSAGE = 'Authentication required'

interface ApolloErrorLike {
  message: string
}

interface HandleApolloErrorParams {
  graphQLErrors?: readonly ApolloErrorLike[]
  networkError?: Error | null
  operation?: { operationName?: string; getContext?: () => Record<string, unknown> }
  /** Ueberschreibbar, damit der Test nicht die echte Navigation ausloest. */
  redirectToLogin?: () => void
}

function defaultRedirectToLogin() {
  window.location.href = '/login'
}

export function handleApolloError({
  graphQLErrors,
  networkError,
  operation,
  redirectToLogin = defaultRedirectToLogin,
}: HandleApolloErrorParams): void {
  const messages = (graphQLErrors ?? []).map((err) => err.message)

  // Abgelaufene Sitzung: aufraeumen und zum Login. Kein Toast, das waere nur
  // eine Meldung, die waehrend der Navigation verschwindet.
  if (messages.includes(AUTH_ERROR_MESSAGE)) {
    if (localStorage.getItem('auth_token')) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('refresh_token')
      redirectToLogin()
    }
    return
  }

  const context = operation?.getContext?.() ?? {}
  if (context.suppressErrorToast) return

  if (messages.length > 0) {
    pushToast({
      title: i18n.t('common.error'),
      description: messages.join(' · '),
      variant: 'error',
    })
    return
  }

  if (networkError) {
    pushToast({
      title: i18n.t('common.error'),
      description: i18n.t('common.networkError'),
      variant: 'error',
    })
  }
}

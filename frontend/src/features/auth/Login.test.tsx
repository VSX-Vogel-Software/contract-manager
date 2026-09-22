import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Login } from './Login'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ssoEnabled = { current: true }

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client')
  return {
    ...actual,
    gql: (strings: TemplateStringsArray) => strings[0],
    useQuery: (query: string) => ({
      data: String(query).includes('entraSsoEnabled')
        ? { entraSsoEnabled: ssoEnabled.current }
        : { signupEnabled: false },
    }),
  }
})

// Die Zwei-Faktor-Maske hat eigene Abfragen - hier geht es nur darum, ob
// Login an sie uebergibt.
vi.mock('./TwoFactorVerify', () => ({
  TwoFactorVerify: () => <div data-testid="two-factor-verify" />,
}))

const loginWithTokens = vi.fn().mockResolvedValue(true)

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginWithTokens,
    isLoading: false,
  }),
}))

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>
  )
}

function setFragment(hash: string) {
  window.history.replaceState(null, '', `/login${hash}`)
}

describe('Login', () => {
  beforeEach(() => {
    ssoEnabled.current = true
    loginWithTokens.mockClear()
    setFragment('')
  })

  afterEach(() => {
    setFragment('')
  })

  describe('Anmeldewege', () => {
    it('bietet Microsoft an und haelt das Passwortfeld zunaechst zurueck', () => {
      renderLogin()

      expect(screen.getByTestId('sso-button')).toBeInTheDocument()
      expect(screen.queryByTestId('local-login-form')).not.toBeInTheDocument()
    })

    it('zeigt ohne eingerichtetes SSO das gewohnte Formular', () => {
      ssoEnabled.current = false

      renderLogin()

      expect(screen.getByTestId('local-login-form')).toBeInTheDocument()
      expect(screen.queryByTestId('sso-button')).not.toBeInTheDocument()
    })

    it('zeigt das Formular auf dem festen Notweg-Pfad', () => {
      renderLogin('/login/local')

      expect(screen.getByTestId('local-login-form')).toBeInTheDocument()
      expect(screen.queryByTestId('sso-button')).not.toBeInTheDocument()
    })
  })

  describe('Rueckkehr vom Verzeichnis', () => {
    it('bietet nach einem Ausfall den lokalen Weg an', () => {
      setFragment('#sso_error=unavailable')

      renderLogin()

      expect(screen.getByTestId('local-login-form')).toBeInTheDocument()
      expect(screen.getByTestId('login-error')).toHaveTextContent('auth.sso.unavailable')
    })

    it('bietet nach einer Ablehnung KEINEN lokalen Weg an', () => {
      // Sonst bekaeme genau das gesperrte Konto eine Hintertuer.
      setFragment('#sso_error=denied&detail=Account+is+blocked')

      renderLogin()

      expect(screen.getByTestId('login-error')).toHaveTextContent('Account is blocked')
      expect(screen.queryByTestId('local-login-form')).not.toBeInTheDocument()
    })

    it('uebernimmt die Token einer erfolgreichen Anmeldung', () => {
      setFragment('#access_token=abc&refresh_token=def')

      renderLogin()

      expect(loginWithTokens).toHaveBeenCalledWith('abc', 'def')
    })

    it('raeumt das Fragment aus der Adresszeile', () => {
      setFragment('#access_token=abc&refresh_token=def')

      renderLogin()

      expect(window.location.hash).toBe('')
    })

    it('verlangt den zweiten Faktor, wenn das Verzeichnis keinen geprueft hat', () => {
      setFragment('#two_factor=chal&method=email')

      renderLogin()

      expect(screen.getByTestId('two-factor-verify')).toBeInTheDocument()
      expect(screen.queryByTestId('local-login-form')).not.toBeInTheDocument()
      // Ohne zweiten Faktor gibt es keine Sitzung.
      expect(loginWithTokens).not.toHaveBeenCalled()
    })
  })
})

import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react'
import { ApolloError, useApolloClient, gql } from '@apollo/client'
import { clearSsoSession } from './ssoSession'

interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  tenantId: number | null
  tenantName: string | null
  companyName: string | null
  roleName: string | null
  isAdmin: boolean
  roles: string[]
  permissions: string[]
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  /** Server beim Start nicht erreichbar - Anmeldung bleibt erhalten */
  connectionError: boolean
  /** Anmeldestatus erneut pruefen (nach connectionError) */
  retryAuth: () => void
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; twoFactor?: { challengeToken: string; method: string }; setupRequired?: boolean }>
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<boolean>
  logout: () => void
  refetchUser: () => Promise<void>
  hasPermission: (resource: string, action: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      ... on AuthPayload {
        accessToken
        refreshToken
        userId
        email
        tenantId
      }
      ... on TwoFactorChallenge {
        requiresTwoFactor
        challengeToken
        method
      }
      ... on AuthError {
        message
      }
    }
  }
`

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      firstName
      lastName
      tenantId
      tenantName
      companyName
      roleName
      isAdmin
      roles
      permissions
    }
  }
`

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
/** Versuche fuer die Anmeldepruefung beim Start, bevor "nicht erreichbar" kommt */
const AUTH_CHECK_ATTEMPTS = 3
const AUTH_CHECK_RETRY_MS = 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [isLoading, setIsLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const client = useApolloClient()

  // Check authentication status on mount
  const checkAuth = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (!storedToken) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setConnectionError(false)

    for (let attempt = 1; ; attempt++) {
      try {
        const { data } = await client.query({
          query: ME_QUERY,
          context: {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          },
          fetchPolicy: 'network-only',
        })

        if (data.me) {
          setUser(data.me)
          setToken(storedToken)
        } else {
          // Token invalid, clear storage
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
          setToken(null)
        }
        break
      } catch (err) {
        // Nur ein Netzwerkfehler (Funkloch, Server kurz weg) ist kein Grund
        // zum Abmelden - sonst ist man auf dem Telefon nach jedem Tunnel
        // ausgeloggt. Erst erneut versuchen, dann "nicht erreichbar" zeigen
        // und die Anmeldung behalten. Alles andere (GraphQL-Fehler) wie bisher.
        const isNetworkError =
          err instanceof ApolloError && !!err.networkError && err.graphQLErrors.length === 0
        if (!isNetworkError) {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
          setToken(null)
          break
        }
        if (attempt >= AUTH_CHECK_ATTEMPTS) {
          setConnectionError(true)
          break
        }
        await new Promise((resolve) => setTimeout(resolve, AUTH_CHECK_RETRY_MS * attempt))
      }
    }
    setIsLoading(false)
  }, [client])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const loginWithTokens = async (accessToken: string, refreshToken: string): Promise<boolean> => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    setToken(accessToken)

    try {
      const { data: userData } = await client.query({
        query: ME_QUERY,
        context: { headers: { Authorization: `Bearer ${accessToken}` } },
        fetchPolicy: 'network-only',
      })
      if (userData.me) {
        setUser(userData.me)
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; twoFactor?: { challengeToken: string; method: string }; setupRequired?: boolean }> => {
    try {
      const { data } = await client.mutate({
        mutation: LOGIN_MUTATION,
        variables: { email, password },
      })

      if (data.login.requiresTwoFactor) {
        return {
          success: false,
          twoFactor: {
            challengeToken: data.login.challengeToken,
            method: data.login.method,
          },
        }
      }

      if (data.login.accessToken) {
        // Empty refreshToken signals 2FA setup is required (tenant enforcement)
        if (data.login.refreshToken === '') {
          // Store restricted token so user can access 2FA setup mutations
          localStorage.setItem(TOKEN_KEY, data.login.accessToken)
          setToken(data.login.accessToken)
          return { success: false, setupRequired: true }
        }
        await loginWithTokens(data.login.accessToken, data.login.refreshToken)
        return { success: true }
      } else {
        return { success: false, error: data.login.message }
      }
    } catch (error) {
      return { success: false, error: 'Login failed. Please try again.' }
    }
  }

  const logout = () => {
    clearSsoSession()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setToken(null)
    setUser(null)
    client.clearStore()
  }

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false
    return user.permissions.includes(`${resource}.${action}`)
  }

  const refetchUser = async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (!storedToken) return

    try {
      const { data } = await client.query({
        query: ME_QUERY,
        context: {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        },
        fetchPolicy: 'network-only',
      })

      if (data.me) {
        setUser(data.me)
      }
    } catch {
      // Ignore errors during refetch
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        connectionError,
        retryAuth: checkAuth,
        login,
        loginWithTokens,
        logout,
        refetchUser,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

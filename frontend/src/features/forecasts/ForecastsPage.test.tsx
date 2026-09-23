import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ForecastsPage } from './ForecastsPage'

// Mock child components to avoid Apollo dependency
vi.mock('@/features/forecast/RevenueForecast', () => ({
  RevenueForecast: () => <div data-testid="revenue-forecast">RevenueForecast</div>,
}))

// Der Mock ersetzt das ganze Modul, muss also alles bereitstellen, was daraus
// importiert wird. Die Seite zeigt seit dem Umbau LiquidityAnalysis; solange der
// Mock nur LiquidityForecast kannte, scheiterte jeder Test, der den Reiter
// rendert -- und niemandem fiel es auf, weil die CI diese Tests nie ausfuehrte.
vi.mock('@/features/liquidity', () => ({
  LiquidityAnalysis: () => <div data-testid="liquidity-analysis">LiquidityAnalysis</div>,
  LiquidityForecast: () => <div data-testid="liquidity-forecast">LiquidityForecast</div>,
}))

// Mock auth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/lib/auth'

function mockAuth(permissions: string[]) {
  ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 1, permissions },
    hasPermission: (resource: string, action: string) =>
      permissions.includes(`${resource}.${action}`),
    isAuthenticated: true,
    isLoading: false,
    token: 'mock',
    login: vi.fn(),
    logout: vi.fn(),
    refetchUser: vi.fn(),
  })
}

function renderPage(route = '/forecasts') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ForecastsPage />
    </MemoryRouter>
  )
}

describe('ForecastsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Frueher zeigte die Seite ohne banking.read gar keine Reiter. Inzwischen gibt
  // es die Reiter goals und priceIncreases, die an keinem Recht haengen - an
  // banking.read haengt nur die Liquiditaet. Genau das prueft der Test jetzt.
  it('hides only the liquidity tab without banking permission', () => {
    mockAuth([])
    renderPage()

    expect(screen.getByTestId('revenue-forecast')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revenue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /liquidity/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('liquidity-analysis')).not.toBeInTheDocument()
  })

  it('renders tabs when user has banking.read permission', () => {
    mockAuth(['banking.read'])
    renderPage()

    expect(screen.getByRole('button', { name: /revenue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /liquidity/i })).toBeInTheDocument()
  })

  it('shows revenue tab active by default', () => {
    mockAuth(['banking.read'])
    renderPage()

    const revenueTab = screen.getByRole('button', { name: /revenue/i })
    expect(revenueTab.className).toContain('border-blue-600')
    expect(screen.getByTestId('revenue-forecast')).toBeInTheDocument()
  })

  it('shows liquidity tab active from URL param', () => {
    mockAuth(['banking.read'])
    renderPage('/forecasts?tab=liquidity')

    const liquidityTab = screen.getByRole('button', { name: /liquidity/i })
    expect(liquidityTab.className).toContain('border-blue-600')
    expect(screen.getByTestId('liquidity-analysis')).toBeInTheDocument()
  })
})

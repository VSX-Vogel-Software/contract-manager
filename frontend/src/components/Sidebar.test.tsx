import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'

// Mock Apollo hooks used by Sidebar
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client')
  return {
    ...actual,
    useLazyQuery: vi.fn(() => [vi.fn(), { data: null, loading: false }]),
    useQuery: vi.fn(() => ({ data: null })),
    gql: (strings: TemplateStringsArray) => strings[0],
  }
})

// Mock auth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}))

// Mock FeedbackModal
vi.mock('./FeedbackModal', () => ({
  FeedbackModal: () => null,
}))

import { useAuth } from '@/lib/auth'

function mockAuth(permissions: string[]) {
  ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 1, firstName: 'Test', lastName: 'User', email: 'test@test.local', tenantName: 'Test', permissions },
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

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

// i18n is not initialized in tests, so t() returns the key itself (e.g. "nav.dashboard")
describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the VSX logo in the header', () => {
    // Das Logo war schon einmal stillschweigend verschwunden (2.35.2).
    mockAuth([])
    renderSidebar()

    const logo = screen.getByAltText('VSX Vogel Software')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/vsx-logo.png')
    expect(screen.getByText(/Contract/)).toBeInTheDocument()
    expect(screen.getByText(/Manager/)).toBeInTheDocument()
  })

  it('always renders items without permission requirements', () => {
    mockAuth([])
    renderSidebar()

    // These nav items have no permission requirement
    expect(screen.getByText('nav.dashboard')).toBeInTheDocument()
    expect(screen.getByText('nav.contracts')).toBeInTheDocument()
    expect(screen.getByText('nav.products')).toBeInTheDocument()
    expect(screen.getByText('nav.forecasts')).toBeInTheDocument()
  })

  it('hides permission-gated items when user lacks permission', () => {
    mockAuth([])
    renderSidebar()

    // Invoices requires invoices.read, Banking requires banking.read
    expect(screen.queryByText('nav.invoices')).not.toBeInTheDocument()
    expect(screen.queryByText('nav.banking')).not.toBeInTheDocument()
  })

  it('shows permission-gated items when user has permission', () => {
    mockAuth(['invoices.read', 'banking.read'])
    renderSidebar()

    expect(screen.getByText('nav.invoices')).toBeInTheDocument()
    expect(screen.getByText('nav.banking')).toBeInTheDocument()
  })

  it('renders forecasts link pointing to /forecasts', () => {
    mockAuth([])
    renderSidebar()

    const link = screen.getByText('nav.forecasts').closest('a')
    expect(link).toHaveAttribute('href', '/forecasts')
  })
})

describe('Abmelden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('meldet eine Passwort-Sitzung ohne Rueckfrage ab', async () => {
    const user = userEvent.setup()
    mockAuth([])
    renderSidebar()

    await user.click(screen.getByTestId('sign-out'))

    expect(screen.queryByTestId('sign-out-dialog')).not.toBeInTheDocument()
  })

  it('fragt bei einer SSO-Sitzung nach', async () => {
    // Sonst bliebe die Microsoft-Sitzung stillschweigend bestehen.
    const user = userEvent.setup()
    localStorage.setItem('sso_session', '1')
    mockAuth([])
    renderSidebar()

    await user.click(screen.getByTestId('sign-out'))

    expect(screen.getByTestId('sign-out-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('sign-out-here')).toBeInTheDocument()
    expect(screen.getByTestId('sign-out-everywhere')).toBeInTheDocument()
  })
})

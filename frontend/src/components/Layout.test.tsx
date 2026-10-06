import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setViewportWidth } from '@/test/setup'
import { Layout } from './Layout'

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client')
  return {
    ...actual,
    useLazyQuery: vi.fn(() => [vi.fn(), { data: null, loading: false }]),
    useQuery: vi.fn(() => ({ data: null })),
    gql: (strings: TemplateStringsArray) => strings[0],
  }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, firstName: 'Test', lastName: 'User', email: 'test@test.local', tenantName: 'Test', permissions: [] },
    hasPermission: () => false,
    logout: vi.fn(),
  }),
}))

vi.mock('./FeedbackModal', () => ({ FeedbackModal: () => null }))
vi.mock('./UpdateBanner', () => ({ UpdateBanner: () => null }))
vi.mock('@/features/assistant', () => ({ ChatDrawer: () => null }))

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>Startseite</div>} />
          <Route path="customers" element={<div>Kundenliste</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('zeigt auf dem Desktop die feste Seitenleiste und keine Kopfleiste', () => {
    renderLayout()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('mobile-header')).not.toBeInTheDocument()
  })

  it('zeigt auf dem Telefon die Kopfleiste statt der Seitenleiste', () => {
    setViewportWidth(390)
    renderLayout()
    expect(screen.getByTestId('mobile-header')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument()
  })

  it('wechselt beim Drehen/Vergroessern live zwischen den Varianten', () => {
    setViewportWidth(768)
    renderLayout()
    expect(screen.getByTestId('mobile-header')).toBeInTheDocument()
    act(() => setViewportWidth(1180))
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('mobile-header')).not.toBeInTheDocument()
  })

  it('oeffnet die Navigation und schliesst sie nach dem Seitenwechsel', async () => {
    setViewportWidth(390)
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByTestId('mobile-menu-button'))
    const drawer = await screen.findByTestId('nav-drawer')
    await user.click(drawer.querySelector('a[href="/customers"]')!)

    expect(screen.getByText('Kundenliste')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('nav-drawer')).not.toBeInTheDocument())
  })

  it('oeffnet die Vollbild-Suche mit Fokus im Suchfeld', async () => {
    setViewportWidth(390)
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByTestId('mobile-search-button'))
    const search = await screen.findByTestId('mobile-search')
    expect(search.querySelector('input')).toHaveFocus()
  })
})

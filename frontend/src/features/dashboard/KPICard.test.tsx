import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { setViewportWidth } from '@/test/setup'
import { KPICard } from './KPICard'

const trend = [
  { month: '2026-08', value: 10 },
  { month: '2026-09', value: 12 },
  { month: '2026-10', value: 11 },
]

function Target() {
  const location = useLocation()
  return <div data-testid="target">{location.pathname + location.search}</div>
}

function renderCard(props: Partial<React.ComponentProps<typeof KPICard>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <KPICard
              kpiKey="active-contracts"
              title="Aktive Vertraege"
              value={31}
              explanation="Zaehlt alle aktiven Vertraege"
              icon={FileText}
              href="/contracts?status=active"
              trend={trend}
              {...props}
            />
          }
        />
        <Route path="/contracts" element={<Target />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('KPICard', () => {
  it('verlinkt ueber den Titel; die Klickflaeche deckt die ganze Karte ab', async () => {
    renderCard()
    const link = screen.getByTestId('kpi-card-link-active-contracts')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/contracts?status=active')
    expect(link).toHaveTextContent('Aktive Vertraege')
    // Overlay ueber die Karte (::after) - die Karte ist der Bezugsrahmen
    expect(link).toHaveClass('after:absolute', 'after:inset-0')
    expect(screen.getByTestId('kpi-card-active-contracts')).toHaveClass('relative')

    await userEvent.click(link)
    expect(screen.getByTestId('target')).toHaveTextContent('/contracts?status=active')
  })

  it('verschachtelt keine Bedienelemente im Link', () => {
    renderCard()
    const link = screen.getByTestId('kpi-card-link-active-contracts')
    expect(link.querySelector('a, button')).toBeNull()
    expect(screen.getByTestId('kpi-info').closest('a')).toBeNull()
    // Info liegt ueber der Klickflaeche
    expect(screen.getByTestId('kpi-info')).toHaveClass('relative', 'z-10')
  })

  it('zeigt das Icon im Kopf', () => {
    renderCard()
    const icon = screen.getByTestId('kpi-icon-active-contracts')
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('lucide-file-text')
  })

  it('zeigt den Verlauf ab 3 Punkten', () => {
    renderCard()
    expect(screen.getByTestId('kpi-sparkline-active-contracts')).toBeInTheDocument()
  })

  it('zeigt unter 3 Punkten keine Linie', () => {
    renderCard({ trend: trend.slice(0, 2) })
    expect(screen.queryByTestId('kpi-sparkline-active-contracts')).toBeNull()
  })

  it('zeigt ohne Verlauf keine Linie', () => {
    renderCard({ trend: undefined })
    expect(screen.queryByTestId('kpi-sparkline-active-contracts')).toBeNull()
  })

  it('Info-Knopf navigiert nicht (Maus)', async () => {
    renderCard()
    await userEvent.click(screen.getByTestId('kpi-info'))
    expect(screen.queryByTestId('target')).toBeNull()
    expect(screen.getByTestId('kpi-card-active-contracts')).toBeInTheDocument()
  })

  it('Info-Knopf oeffnet auf Touch die Erklaerung und navigiert nicht', async () => {
    setViewportWidth(375, true)
    renderCard()
    await userEvent.click(screen.getByTestId('kpi-info'))
    expect(await screen.findByText('Zaehlt alle aktiven Vertraege')).toBeInTheDocument()
    expect(screen.queryByTestId('target')).toBeNull()
    // Antippen in der Erklaerung fuehrt auch nicht weg
    await userEvent.click(screen.getByText('Zaehlt alle aktiven Vertraege'))
    expect(screen.queryByTestId('target')).toBeNull()
  })

  it('ohne href bleibt die Karte ein einfacher Block', () => {
    render(
      <MemoryRouter>
        <KPICard kpiKey="x" title="Wert" value={5} explanation="E" />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByTestId('kpi-card-x').tagName).toBe('DIV')
  })
})

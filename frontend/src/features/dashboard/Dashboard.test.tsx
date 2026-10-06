import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from './Dashboard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/HelpVideoButton', () => ({
  HelpVideoButton: () => null,
}))

interface QueryOptions {
  variables?: Record<string, unknown>
  context?: Record<string, unknown>
}

const calls: { query: string; options?: QueryOptions }[] = []
const state: { kpis: unknown; trends: unknown } = { kpis: null, trends: null }

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client')
  return {
    ...actual,
    gql: (strings: TemplateStringsArray) => strings.join(''),
    useQuery: vi.fn((query: string, options?: QueryOptions) => {
      calls.push({ query, options })
      if (query.includes('dashboardKpiTrends')) return { data: state.trends, loading: false }
      return { data: state.kpis, loading: false }
    }),
  }
})

const year = new Date().getFullYear()
const series = (n: number, base = 10) =>
  Array.from({ length: n }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, value: base + i }))

const KPIS = {
  dashboardKpis: {
    totalActiveContracts: 31,
    totalContractValue: '594557036',
    annualRecurringRevenue: '202488742',
    yearToDateRevenue: '179137590',
    currentYearForecast: '205048161',
    currentYearOneOff: '2612088',
    currentYearDiscounts: '0',
    nextYearForecast: '148537610',
    nextYearOneOff: '233438',
    nextYearDiscounts: '0',
  },
  newBusinessMetrics: { wonNewArr: '50000', backToBaseArr: '20000', wonDevelopmentRevenue: '10000', wonDealCount: 4 },
  priceIncreaseImpact: {
    year,
    totalArrImpact: '30000',
    inflationArrImpact: '20000',
    negotiatedArrImpact: '10000',
    untaggedArrImpact: '0',
    itemCount: 12,
  },
  newBusinessGoals: [{ id: 1, year, goalType: 'new_arr', targetAmount: '100000' }],
  revenueGoals: [{ id: 1, year, revenueType: 'recurring', targetAmount: '200000000' }],
  revenueByStream: [
    { revenueType: 'recurring', ytdActual: '150000000', fullYearForecast: '202436073.71' },
    { revenueType: 'advanced_development', ytdActual: '2000000', fullYearForecast: '2548593.75' },
    { revenueType: 'training_implementation', ytdActual: '50000', fullYearForecast: '63493.75' },
  ],
  dashboardPreferences: { showContracts: true, showRevenueGoals: true, showNewBusiness: true, showPriceIncreaseImpact: true },
}

const TRENDS = {
  dashboardKpiTrends: {
    activeContracts: series(12),
    annualRecurringRevenue: series(12),
    // nur zwei Snapshots: keine Linie
    totalContractValue: series(2),
    currentYearForecast: [],
    nextYearForecast: series(3),
    revenueStreamForecast: [
      { stream: 'recurring', points: series(4) },
      { stream: 'advanced_development', points: series(1) },
    ],
    yearToDateRevenue: series(10),
    wonNewArr: series(10),
    backToBaseArr: series(10),
    wonDevelopmentRevenue: series(10),
    wonDealCount: series(10),
    priceIncreaseTotal: series(10),
    priceIncreaseInflation: series(10),
    priceIncreaseNegotiated: series(10),
  },
}

// Kachel -> [Link, Icon-Klasse]
const EXPECTED: Record<string, [string, string]> = {
  'active-contracts': ['/contracts', 'lucide-file-text'],
  'total-contract-value': ['/contracts', 'lucide-briefcase'],
  arr: ['/forecasts', 'lucide-repeat'],
  'ytd-revenue': ['/forecasts', 'lucide-receipt'],
  'current-year-forecast': ['/forecasts', 'lucide-trending-up'],
  'next-year-forecast': ['/forecasts', 'lucide-calendar-clock'],
  new_arr: [`/dashboard/new-business/new_arr?year=${year}`, 'lucide-user-plus'],
  back_to_base_arr: [`/dashboard/new-business/back_to_base_arr?year=${year}`, 'lucide-user-check'],
  new_development: [`/dashboard/new-business/new_development?year=${year}`, 'lucide-code'],
  new_deal_count: [`/dashboard/new-business/new_deal_count?year=${year}`, 'lucide-handshake'],
  'price-increase-total': [`/contracts?priceIncrease=true&year=${year}`, 'lucide-arrow-up-right'],
  'price-increase-inflation': [`/contracts?priceIncrease=true&year=${year}`, 'lucide-percent'],
  'price-increase-negotiated': [`/contracts?priceIncrease=true&year=${year}`, 'lucide-handshake'],
  'goal-recurring': ['/forecasts?tab=goals', 'lucide-repeat'],
  'goal-advanced_development': ['/forecasts?tab=goals', 'lucide-code'],
  'goal-training_implementation': ['/forecasts?tab=goals', 'lucide-graduation-cap'],
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    calls.length = 0
    state.kpis = KPIS
    state.trends = TRENDS
  })

  it('verlinkt alle 16 Kacheln mit Icon', () => {
    renderDashboard()
    expect(screen.getAllByTestId(/^kpi-card-link-/)).toHaveLength(16)
    for (const [key, [href, iconClass]] of Object.entries(EXPECTED)) {
      const link = screen.getByTestId(`kpi-card-link-${key}`)
      expect(link.tagName, key).toBe('A')
      expect(link, key).toHaveAttribute('href', href)
      expect(screen.getByTestId(`kpi-icon-${key}`), key).toHaveClass(iconClass)
    }
  })

  it('zeigt Verlaeufe nur ab 3 Punkten', () => {
    renderDashboard()
    for (const key of ['active-contracts', 'arr', 'ytd-revenue', 'next-year-forecast', 'new_arr', 'new_deal_count', 'price-increase-total', 'goal-recurring']) {
      expect(screen.getByTestId(`kpi-sparkline-${key}`), key).toBeInTheDocument()
    }
    for (const key of ['total-contract-value', 'current-year-forecast', 'goal-advanced_development', 'goal-training_implementation']) {
      expect(screen.queryByTestId(`kpi-sparkline-${key}`), key).toBeNull()
    }
  })

  it('zeigt die Werte, auch solange der Verlauf fehlt', () => {
    state.trends = undefined
    renderDashboard()
    expect(screen.getByTestId('kpi-card-active-contracts')).toHaveTextContent('31')
    expect(screen.queryAllByTestId(/^kpi-sparkline-/)).toHaveLength(0)
  })

  it('fragt den Verlauf separat und ohne Fehler-Toast ab', () => {
    renderDashboard()
    const trendCall = calls.find((c) => c.query.includes('dashboardKpiTrends'))
    expect(trendCall).toBeDefined()
    expect(trendCall!.options?.context).toEqual({ suppressErrorToast: true })
    expect(trendCall!.options?.variables).toEqual({ year, months: 12 })
    // die Kennzahlen-Abfrage enthaelt den Verlauf nicht
    const kpiCall = calls.find((c) => c.query.includes('dashboardKpis {'))
    expect(kpiCall!.query).not.toContain('dashboardKpiTrends')
  })

  it('behaelt Ziel und Fortschritt an New-Business- und Ziel-Kacheln', () => {
    renderDashboard()
    const nb = within(screen.getByTestId('kpi-card-new_arr'))
    expect(nb.getByText(/forecasts\.goals\.target/)).toBeInTheDocument()
    expect(nb.getByText('50%')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-card-goal-recurring')).getByText('101%')).toBeInTheDocument()
    // ohne Ziel der Hinweis auf die Einstellungen
    expect(
      within(screen.getByTestId('kpi-card-goal-advanced_development')).getByText('forecasts.goals.setGoals')
    ).toBeInTheDocument()
    // Preiserhoehung: Anzahl Positionen als Untertitel
    expect(
      within(screen.getByTestId('kpi-card-price-increase-total')).getByText('dashboard.priceIncrease.itemCount')
    ).toBeInTheDocument()
  })

  it('zeigt einen Info-Knopf an jeder Kachel mit Erklaerung', () => {
    renderDashboard()
    // 6 + 4 + 3 + 1 (von den Umsatzzielen hat nur wiederkehrender Umsatz eine Erklaerung)
    expect(screen.getAllByTestId('kpi-info')).toHaveLength(14)
  })
})

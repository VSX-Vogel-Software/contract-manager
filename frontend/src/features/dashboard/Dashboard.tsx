import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, gql } from '@apollo/client'
import {
  Loader2,
  AlertCircle,
  Info,
  FileText,
  Briefcase,
  Repeat,
  Receipt,
  TrendingUp,
  CalendarClock,
  UserPlus,
  UserCheck,
  Code,
  Handshake,
  ArrowUpRight,
  Percent,
  GraduationCap,
} from 'lucide-react'
import { KPICard } from './KPICard'
import { HelpVideoButton } from '@/components/HelpVideoButton'
import type { SparklinePoint } from '@/components/Sparkline'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const DASHBOARD_KPIS_QUERY = gql`
  query DashboardKPIs($year: Int!) {
    dashboardKpis {
      totalActiveContracts
      totalContractValue
      annualRecurringRevenue
      yearToDateRevenue
      currentYearForecast
      currentYearOneOff
      currentYearDiscounts
      nextYearForecast
      nextYearOneOff
      nextYearDiscounts
    }
    newBusinessMetrics(year: $year) {
      wonNewArr
      backToBaseArr
      wonDevelopmentRevenue
      wonDealCount
    }
    priceIncreaseImpact(year: $year) {
      year
      totalArrImpact
      inflationArrImpact
      negotiatedArrImpact
      untaggedArrImpact
      itemCount
    }
    newBusinessGoals(year: $year) {
      id
      year
      goalType
      targetAmount
    }
    revenueGoals(year: $year) {
      id
      year
      revenueType
      targetAmount
    }
    revenueByStream(year: $year) {
      revenueType
      ytdActual
      fullYearForecast
    }
    dashboardPreferences {
      showContracts
      showRevenueGoals
      showNewBusiness
      showPriceIncreaseImpact
    }
  }
`

// Verlauf je Kachel (Change dashboard-kpi-trends). Eigene Abfrage, damit die
// Werte nicht auf die teurere Rueckrechnung warten.
const DASHBOARD_KPI_TRENDS_QUERY = gql`
  query DashboardKpiTrends($year: Int!, $months: Int) {
    dashboardKpiTrends(year: $year, months: $months) {
      activeContracts { month value }
      annualRecurringRevenue { month value }
      totalContractValue { month value }
      currentYearForecast { month value }
      nextYearForecast { month value }
      revenueStreamForecast {
        stream
        points { month value }
      }
      yearToDateRevenue { month value }
      wonNewArr { month value }
      backToBaseArr { month value }
      wonDevelopmentRevenue { month value }
      wonDealCount { month value }
      priceIncreaseTotal { month value }
      priceIncreaseInflation { month value }
      priceIncreaseNegotiated { month value }
    }
  }
`

interface DashboardKpiTrends {
  activeContracts: SparklinePoint[]
  annualRecurringRevenue: SparklinePoint[]
  totalContractValue: SparklinePoint[]
  currentYearForecast: SparklinePoint[]
  nextYearForecast: SparklinePoint[]
  revenueStreamForecast: { stream: string; points: SparklinePoint[] }[]
  yearToDateRevenue: SparklinePoint[]
  wonNewArr: SparklinePoint[]
  backToBaseArr: SparklinePoint[]
  wonDevelopmentRevenue: SparklinePoint[]
  wonDealCount: SparklinePoint[]
  priceIncreaseTotal: SparklinePoint[]
  priceIncreaseInflation: SparklinePoint[]
  priceIncreaseNegotiated: SparklinePoint[]
}

/** Ziel, Abweichung und Fortschrittsbalken unter dem Wert (New Business, Umsatzziele) */
function GoalProgress({ actual, target, format }: { actual: number; target: number; format: (v: number) => string }) {
  const { t } = useTranslation()
  const progress = (actual / target) * 100
  const diff = actual - target
  const overTarget = progress > 100
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
        <span>{t('forecasts.goals.target')}: {format(target)}</span>
        <span className={diff >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
          {diff >= 0 ? '+' : ''}{format(diff)}
        </span>
      </div>
      <div className="mt-2 relative h-2 w-full rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all ${
            overTarget ? 'bg-emerald-500' : progress >= 80 ? 'bg-blue-500' : 'bg-blue-400'
          }`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <p className={`mt-1 text-xs font-medium ${overTarget ? 'text-emerald-600' : 'text-muted-foreground'}`}>
        {Math.round(progress)}%
      </p>
    </>
  )
}

interface DashboardKPIs {
  totalActiveContracts: number
  totalContractValue: string
  annualRecurringRevenue: string
  yearToDateRevenue: string
  currentYearForecast: string
  currentYearOneOff: string
  currentYearDiscounts: string
  nextYearForecast: string
  nextYearOneOff: string
  nextYearDiscounts: string
}

interface PriceIncreaseImpact {
  year: number
  totalArrImpact: string
  inflationArrImpact: string
  negotiatedArrImpact: string
  untaggedArrImpact: string
  itemCount: number
}

interface NewBusinessMetrics {
  wonNewArr: string
  backToBaseArr: string
  wonDevelopmentRevenue: string
  wonDealCount: number
}

interface NewBusinessGoal {
  id: number
  year: number
  goalType: string
  targetAmount: string
}

interface RevenueGoal {
  id: number
  year: number
  revenueType: string
  targetAmount: string
}

interface RevenueStreamData {
  revenueType: string
  ytdActual: string
  fullYearForecast: string
}

interface DashboardPreferences {
  showContracts: boolean
  showRevenueGoals: boolean
  showNewBusiness: boolean
  showPriceIncreaseImpact: boolean
}

interface DashboardKPIsData {
  dashboardKpis: DashboardKPIs
  priceIncreaseImpact: PriceIncreaseImpact
  newBusinessMetrics: NewBusinessMetrics
  newBusinessGoals: NewBusinessGoal[]
  revenueGoals: RevenueGoal[]
  revenueByStream: RevenueStreamData[]
  dashboardPreferences: DashboardPreferences
}

export function Dashboard() {
  const { t } = useTranslation()
  const [showInfoModal, setShowInfoModal] = useState(false)

  const currentYear = new Date().getFullYear()
  const { data: kpisData, loading: kpisLoading, error: kpisError } = useQuery<DashboardKPIsData>(DASHBOARD_KPIS_QUERY, {
    variables: { year: currentYear },
  })
  // Fehlt der Verlauf (Fehler, aeltere API), zeigt das Dashboard einfach keine
  // Linien - kein Toast, die Kennzahlen selbst sind ja da
  const { data: trendsData } = useQuery<{ dashboardKpiTrends: DashboardKpiTrends }>(DASHBOARD_KPI_TRENDS_QUERY, {
    variables: { year: currentYear, months: 12 },
    context: { suppressErrorToast: true },
  })
  const trends = trendsData?.dashboardKpiTrends
  if (kpisLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (kpisError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-destructive">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>{t('common.error')}: {kpisError.message}</p>
      </div>
    )
  }

  const kpis = kpisData?.dashboardKpis
  const dashPrefs = kpisData?.dashboardPreferences
  const nb = kpisData?.newBusinessMetrics
  const nbGoalMap: Record<string, number> = {}
  for (const g of kpisData?.newBusinessGoals || []) {
    nbGoalMap[g.goalType] = parseFloat(g.targetAmount)
  }

  // Revenue goals maps
  const revenueGoalMap: Record<string, number> = {}
  for (const g of kpisData?.revenueGoals || []) {
    revenueGoalMap[g.revenueType] = parseFloat(g.targetAmount)
  }
  const streamDataMap: Record<string, { ytdActual: number; forecast: number }> = {}
  for (const s of kpisData?.revenueByStream || []) {
    streamDataMap[s.revenueType] = { ytdActual: parseFloat(s.ytdActual), forecast: parseFloat(s.fullYearForecast) }
  }
  const STANDARD_STREAMS = [
    { key: 'recurring', icon: Repeat, i18nKey: 'products.revenueTypes.recurring', explanationKey: 'dashboard.revenueGoals.recurringExplanation' },
    { key: 'advanced_development', icon: Code, i18nKey: 'products.revenueTypes.advancedDevelopment' },
    { key: 'training_implementation', icon: GraduationCap, i18nKey: 'products.revenueTypes.trainingImplementation' },
  ] as const
  const streamTrendMap: Record<string, SparklinePoint[]> = {}
  for (const st of trends?.revenueStreamForecast || []) {
    streamTrendMap[st.stream] = st.points
  }
  const hasRevenueGoalsData = Object.keys(revenueGoalMap).length > 0 || Object.values(streamDataMap).some(s => s.forecast > 0)
  const newBusinessCards = nb ? [
    { key: 'new_arr', icon: UserPlus, label: t('forecasts.newBusiness.newNameArr'), info: t('dashboard.kpis.newNameArrExplanation'), actual: parseFloat(nb.wonNewArr), target: nbGoalMap['new_arr'] || 0, isCurrency: true, trend: trends?.wonNewArr },
    { key: 'back_to_base_arr', icon: UserCheck, label: t('forecasts.newBusiness.backToBaseArr'), info: t('dashboard.kpis.backToBaseArrExplanation'), actual: parseFloat(nb.backToBaseArr), target: nbGoalMap['back_to_base_arr'] || 0, isCurrency: true, trend: trends?.backToBaseArr },
    { key: 'new_development', icon: Code, label: t('forecasts.newBusiness.wonDevelopment'), info: t('dashboard.kpis.wonDevelopmentExplanation'), actual: parseFloat(nb.wonDevelopmentRevenue), target: nbGoalMap['new_development'] || 0, isCurrency: true, trend: trends?.wonDevelopmentRevenue },
    { key: 'new_deal_count', icon: Handshake, label: t('forecasts.newBusiness.wonDealCount'), info: t('dashboard.kpis.wonDealCountExplanation'), actual: nb.wonDealCount, target: nbGoalMap['new_deal_count'] || 0, isCurrency: false, trend: trends?.wonDealCount },
  ] : []

  const formatForecastSubtitle = (oneOff: string | undefined, discounts: string | undefined) => {
    const fmt = (v: number) => new Intl.NumberFormat('de-DE', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(Math.abs(v))
    const oneOffVal = parseFloat(oneOff ?? '0')
    const discountsVal = parseFloat(discounts ?? '0')
    const parts: string[] = []
    if (oneOffVal > 0) parts.push(t('dashboard.kpis.inclOneOff', { amount: fmt(oneOffVal) }))
    if (discountsVal < 0) parts.push(t('dashboard.kpis.inclDiscounts', { amount: fmt(discountsVal) }))
    return parts.length > 0 ? parts.join('\n') : undefined
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-6">
        <h1 className="min-w-0 break-words text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfoModal(true)}
            aria-label={t('mobile.showInfo')}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 touch:p-2"
          >
            <Info className="h-5 w-5" />
          </button>
          <HelpVideoButton />
        </div>
      </div>

      {/* KPI Cards */}
      {(dashPrefs?.showContracts !== false) && (
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 mb-8">
        <KPICard
          kpiKey="active-contracts"
          icon={FileText}
          href="/contracts"
          trend={trends?.activeContracts}
          title={t('dashboard.kpis.totalActiveContracts')}
          value={kpis?.totalActiveContracts ?? 0}
          explanation={t('dashboard.kpis.totalActiveContractsExplanation')}
        />
        <KPICard
          kpiKey="total-contract-value"
          icon={Briefcase}
          href="/contracts"
          trend={trends?.totalContractValue}
          title={t('dashboard.kpis.totalContractValue')}
          value={parseFloat(kpis?.totalContractValue ?? '0')}
          explanation={t('dashboard.kpis.totalContractValueExplanation')}
          isCurrency
        />
        <KPICard
          kpiKey="arr"
          icon={Repeat}
          href="/forecasts"
          trend={trends?.annualRecurringRevenue}
          title={t('dashboard.kpis.annualRecurringRevenue')}
          value={parseFloat(kpis?.annualRecurringRevenue ?? '0')}
          explanation={t('dashboard.kpis.annualRecurringRevenueExplanation')}
          isCurrency
        />
        <KPICard
          kpiKey="ytd-revenue"
          icon={Receipt}
          href="/forecasts"
          trend={trends?.yearToDateRevenue}
          title={t('dashboard.kpis.yearToDateRevenue')}
          value={parseFloat(kpis?.yearToDateRevenue ?? '0')}
          explanation={t('dashboard.kpis.yearToDateRevenueExplanation')}
          isCurrency
        />
        <KPICard
          kpiKey="current-year-forecast"
          icon={TrendingUp}
          href="/forecasts"
          trend={trends?.currentYearForecast}
          title={t('dashboard.kpis.currentYearForecast')}
          value={parseFloat(kpis?.currentYearForecast ?? '0')}
          subtitle={formatForecastSubtitle(kpis?.currentYearOneOff, kpis?.currentYearDiscounts)}
          explanation={t('dashboard.kpis.currentYearForecastExplanation')}
          isCurrency
        />
        <KPICard
          kpiKey="next-year-forecast"
          icon={CalendarClock}
          href="/forecasts"
          trend={trends?.nextYearForecast}
          title={t('dashboard.kpis.nextYearForecast')}
          value={parseFloat(kpis?.nextYearForecast ?? '0')}
          subtitle={formatForecastSubtitle(kpis?.nextYearOneOff, kpis?.nextYearDiscounts)}
          explanation={t('dashboard.kpis.nextYearForecastExplanation')}
          isCurrency
        />
      </div>
      )}

      {/* New Business KPIs */}
      {(dashPrefs?.showNewBusiness !== false) && nb && (nb.wonDealCount > 0 || parseFloat(nb.wonNewArr) > 0 || parseFloat(nb.backToBaseArr) > 0 || Object.keys(nbGoalMap).length > 0) && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{t('forecasts.newBusiness.title')} <span className="ml-1 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Beta</span></h2>
          {/* Vier Spalten erst ab lg: am Tablet brechen die Titel neben Icon und Info sonst mitten im Wort um */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            {newBusinessCards.map((card) => {
              // Wert wie die uebrigen Kacheln ganzzahlig (passt auf dem Telefon in die
              // halbe Breite); Ziel und Abweichung wie bisher mit Cent
              const format = (v: number) => (card.isCurrency ? formatCurrency(v.toString()) : String(v))
              return (
                <KPICard
                  key={card.key}
                  kpiKey={card.key}
                  icon={card.icon}
                  href={`/dashboard/new-business/${card.key}?year=${currentYear}`}
                  trend={card.trend}
                  title={card.label}
                  value={card.actual}
                  isCurrency={card.isCurrency}
                  explanation={card.info}
                >
                  {card.target > 0 && <GoalProgress actual={card.actual} target={card.target} format={format} />}
                </KPICard>
              )
            })}
          </div>
        </div>
      )}

      {/* Price Increase Impact */}
      {(() => {
        if (dashPrefs?.showPriceIncreaseImpact === false) return null
        const pi = kpisData?.priceIncreaseImpact
        const totalImpact = parseFloat(pi?.totalArrImpact ?? '0')
        if (!pi || totalImpact <= 0) return null
        const href = `/contracts?priceIncrease=true&year=${currentYear}`
        return (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">{t('dashboard.priceIncrease.title')} <span className="ml-1 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Beta</span></h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">
              <KPICard
                kpiKey="price-increase-total"
                icon={ArrowUpRight}
                href={href}
                trend={trends?.priceIncreaseTotal}
                title={t('dashboard.priceIncrease.totalImpact')}
                value={totalImpact}
                explanation={t('dashboard.priceIncrease.totalImpactExplanation')}
                subtitle={t('dashboard.priceIncrease.itemCount', { count: pi.itemCount })}
                isCurrency
              />
              <KPICard
                kpiKey="price-increase-inflation"
                icon={Percent}
                href={href}
                trend={trends?.priceIncreaseInflation}
                title={t('dashboard.priceIncrease.inflation')}
                value={parseFloat(pi.inflationArrImpact)}
                explanation={t('dashboard.priceIncrease.inflationExplanation')}
                isCurrency
              />
              <KPICard
                kpiKey="price-increase-negotiated"
                icon={Handshake}
                href={href}
                trend={trends?.priceIncreaseNegotiated}
                title={t('dashboard.priceIncrease.negotiated')}
                value={parseFloat(pi.negotiatedArrImpact)}
                explanation={t('dashboard.priceIncrease.negotiatedExplanation')}
                isCurrency
              />
            </div>
          </div>
        )
      })()}

      {/* Revenue Goals */}
      {(dashPrefs?.showRevenueGoals !== false) && hasRevenueGoalsData && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{t('dashboard.revenueGoals.title')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">
            {STANDARD_STREAMS.map((stream) => {
              const target = revenueGoalMap[stream.key] || 0
              const forecast = streamDataMap[stream.key]?.forecast ?? 0
              const format = (v: number) => formatCurrency(v.toString())
              return (
                <KPICard
                  key={stream.key}
                  kpiKey={`goal-${stream.key}`}
                  icon={stream.icon}
                  href="/forecasts?tab=goals"
                  trend={streamTrendMap[stream.key]}
                  title={t(stream.i18nKey)}
                  value={forecast}
                  isCurrency
                  explanation={'explanationKey' in stream ? t(stream.explanationKey) : undefined}
                >
                  {target > 0 ? (
                    <GoalProgress actual={forecast} target={target} format={format} />
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="underline">{t('forecasts.goals.setGoals')}</span>
                    </p>
                  )}
                </KPICard>
              )
            })}
          </div>
        </div>
      )}

      {/* Info Modal */}
      <Dialog open={showInfoModal} onOpenChange={setShowInfoModal}>
        <DialogContent className="max-w-2xl max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dashboard.info.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-sm">
            <div>
              <h3 className="font-semibold text-base mb-2">{t('dashboard.info.kpisSection')}</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.totalActiveContracts')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.totalActiveContractsExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.totalContractValue')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.totalContractValueExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.annualRecurringRevenue')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.annualRecurringRevenueExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.yearToDateRevenue')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.yearToDateRevenueExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.currentYearForecast')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.currentYearForecastExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('dashboard.kpis.nextYearForecast')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.nextYearForecastExplanation')}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3 className="font-semibold text-base mb-2">{t('forecasts.newBusiness.title')}</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="font-medium">{t('forecasts.newBusiness.newNameArr')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.newNameArrExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('forecasts.newBusiness.backToBaseArr')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.backToBaseArrExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('forecasts.newBusiness.wonDevelopment')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.wonDevelopmentExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('forecasts.newBusiness.wonDealCount')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.kpis.wonDealCountExplanation')}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3 className="font-semibold text-base mb-2">{t('dashboard.revenueGoals.title')}</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="font-medium">{t('products.revenueTypes.recurring')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.revenueGoals.recurringExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('products.revenueTypes.advancedDevelopment')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.revenueGoals.streamExplanation')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('products.revenueTypes.trainingImplementation')}</dt>
                  <dd className="text-muted-foreground">{t('dashboard.revenueGoals.streamExplanation')}</dd>
                </div>
              </dl>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

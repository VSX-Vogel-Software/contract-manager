import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { RevenueForecast } from '@/features/forecast/RevenueForecast'
import { LiquidityAnalysis } from '@/features/liquidity'
import { RevenueGoalsDashboard } from './RevenueGoalsDashboard'
import { PriceIncreaseAnalytics } from './PriceIncreaseAnalytics'
import { ScrollTabs } from '@/components/ScrollTabs'

export function ForecastsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const hasLiquidity = hasPermission('banking', 'read')
  const activeTab = searchParams.get('tab') || 'revenue'

  const handleTabChange = (value: string) => {
    setSearchParams(value === 'revenue' ? {} : { tab: value })
  }

  const tabProps = (tab: string) => ({
    'aria-current': activeTab === tab ? ('page' as const) : undefined,
    className: tabClass(tab),
  })

  const tabClass = (tab: string) =>
    `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
      activeTab === tab
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
    }`

  if (!hasLiquidity) {
    return (
      <div className="space-y-4">
        <ScrollTabs className="items-center gap-4 border-b border-gray-200" activeKey={activeTab}>
          <button onClick={() => handleTabChange('revenue')} {...tabProps('revenue')}>
            {t('forecasts.revenueTab')}
          </button>
          <button onClick={() => handleTabChange('goals')} {...tabProps('goals')}>
            {t('forecasts.goalsTab')}
          </button>
          <button onClick={() => handleTabChange('priceIncreases')} {...tabProps('priceIncreases')}>
            {t('forecasts.priceIncreasesTab')}
          </button>
        </ScrollTabs>
        {activeTab === 'revenue' && <RevenueForecast />}
        {activeTab === 'goals' && <RevenueGoalsDashboard />}
        {activeTab === 'priceIncreases' && <PriceIncreaseAnalytics />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ScrollTabs className="items-center gap-4 border-b border-gray-200" activeKey={activeTab}>
        <button onClick={() => handleTabChange('revenue')} {...tabProps('revenue')}>
          {t('forecasts.revenueTab')}
        </button>
        <button onClick={() => handleTabChange('liquidity')} {...tabProps('liquidity')}>
          {t('forecasts.liquidityTab')}
        </button>
        <button onClick={() => handleTabChange('goals')} {...tabProps('goals')}>
          {t('forecasts.goalsTab')}
        </button>
        <button onClick={() => handleTabChange('priceIncreases')} {...tabProps('priceIncreases')}>
          {t('forecasts.priceIncreasesTab')}
        </button>
      </ScrollTabs>
      {activeTab === 'revenue' && <RevenueForecast />}
      {activeTab === 'liquidity' && <LiquidityAnalysis />}
      {activeTab === 'goals' && <RevenueGoalsDashboard />}
      {activeTab === 'priceIncreases' && <PriceIncreaseAnalytics />}
    </div>
  )
}

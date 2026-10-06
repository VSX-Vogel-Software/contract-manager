import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { cn } from '@/lib/utils'

export interface SparklinePoint {
  /** "YYYY-MM" */
  month: string
  value: number
}

/** Unter dieser Zahl an Punkten zeigt die Linie keinen Verlauf, sondern Rauschen. */
export const SPARKLINE_MIN_POINTS = 3

interface SparklineProps {
  points: readonly SparklinePoint[] | null | undefined
  className?: string
  'data-testid'?: string
  /**
   * Mit Maus: beim Ueberfahren Monat und Wert zeigen. Auf Touch bleibt die
   * Linie rein dekorativ - dort fuehrt Antippen der Kachel zur Zielseite.
   */
  interactive?: boolean
  /** Formatierung des Werts im Tooltip (z. B. Waehrung) */
  formatValue?: (value: number) => string
  /** Klick auf die Linie (die Kachel liegt sonst darunter) */
  onClick?: () => void
}

/** "2026-09" -> "Sep. 2026" bzw. "Sep 2026" je nach Sprache */
export function formatSparklineMonth(month: string, locale: string): string {
  const [year, m] = month.split('-').map(Number)
  if (!year || !m) return month
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(year, m - 1, 1))
}

interface SparklineTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
  formatValue: (value: number) => string
  locale: string
}

function SparklineTooltip({ active, payload, formatValue, locale }: SparklineTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null
  const point = payload[0].payload as SparklinePoint
  return (
    <div className="pointer-events-none whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md" data-testid="sparkline-tooltip">
      <div className="text-muted-foreground">{formatSparklineMonth(point.month, locale)}</div>
      <div className="font-medium tabular-nums">{formatValue(point.value)}</div>
    </div>
  )
}

/**
 * Kleiner Verlauf ohne Achsen und Animation - nur die Form der Kurve, auf
 * Wunsch mit Tooltip (Monat + Wert). Fuer Screenreader dekorativ
 * (aria-hidden): der aktuelle Wert steht als Zahl daneben.
 */
export function Sparkline({
  points,
  className,
  'data-testid': testId,
  interactive = false,
  formatValue = (v) => String(v),
  onClick,
}: SparklineProps) {
  const { i18n } = useTranslation()
  // useId liefert ":r1:" - Doppelpunkte stoeren in url(#...) nicht ueberall
  const gradientId = `sparkline-${useId().replace(/:/g, '')}`

  if (!points || points.length < SPARKLINE_MIN_POINTS) return null

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Flache Reihe: etwas Luft, sonst liegt die Linie auf der Unterkante
  const pad = max === min ? Math.max(Math.abs(max) * 0.1, 1) : 0

  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      // interaktiv: ueber die Klickflaeche der Kachel heben, sonst kommt kein Hover an
      className={cn('h-7 w-full sm:h-9', interactive && 'relative z-10', interactive && onClick && 'cursor-pointer', className)}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 120, height: 28 }}>
        <AreaChart
          data={points as SparklinePoint[]}
          margin={{ top: 2, right: 1, bottom: 1, left: 1 }}
          onClick={interactive ? onClick : undefined}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {/* Tailwind blue-500 */}
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          {interactive && (
            <Tooltip
              content={({ active, payload }) => (
                <SparklineTooltip
                  active={active}
                  payload={payload}
                  formatValue={formatValue}
                  locale={i18n?.language || 'de'}
                />
              )}
              cursor={{ stroke: '#93c5fd', strokeWidth: 1 }}
              isAnimationActive={false}
              // x: im Diagramm bleiben - am rechten Rand klappt der Tooltip nach links um
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 20, outline: 'none' }}
              offset={8}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={interactive ? { r: 3, strokeWidth: 0, fill: '#2563eb' } : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

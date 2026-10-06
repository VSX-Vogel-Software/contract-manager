import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Info, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Sparkline, type SparklinePoint } from '@/components/Sparkline'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import { useIsTouch } from '@/lib/useMediaQuery'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  explanation?: string
  isCurrency?: boolean
  className?: string
  /** Kleines Symbol im Kopf neben dem Titel */
  icon?: LucideIcon
  /** Ziel beim Klick/Antippen: die ganze Karte wird zum Link */
  href?: string
  /** Verlauf unter dem Wert, erst ab 3 Punkten sichtbar */
  trend?: readonly SparklinePoint[] | null
  /** Schluessel fuer die testids `kpi-card-<key>` und `kpi-sparkline-<key>` */
  kpiKey?: string
  /** Zusaetzlicher Inhalt unter dem Wert (z. B. Ziel und Fortschritt) */
  children?: ReactNode
}

export function KPICard({
  title,
  value,
  subtitle,
  explanation,
  isCurrency = false,
  className,
  icon: Icon,
  href,
  trend,
  kpiKey,
  children,
}: KPICardProps) {
  const navigate = useNavigate()
  const isTouch = useIsTouch()
  const format = (v: number) =>
    isCurrency ? formatCurrency(v, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : formatNumber(v)
  const displayValue = typeof value === 'number' ? format(value) : value

  // Mit href ist die ganze Karte klickbar, aber nicht als <a> um alles herum:
  // Info-Knopf und Links im Inhalt (z. B. "Ziele festlegen") waeren dann
  // verschachtelte interaktive Elemente. Stattdessen ist der Titel der Link,
  // seine Klickflaeche spannt per ::after ueber die Karte, und alle anderen
  // Bedienelemente liegen mit z-10 darueber.
  return (
    <Card
      className={cn(
        href &&
          'relative h-full transition-all hover:border-blue-300 hover:shadow-md has-[a[data-kpi-link]:focus-visible]:ring-2 has-[a[data-kpi-link]:focus-visible]:ring-blue-500 has-[a[data-kpi-link]:focus-visible]:ring-offset-2',
        className
      )}
      data-testid={kpiKey ? `kpi-card-${kpiKey}` : undefined}
    >
      {/* Auf dem Telefon stehen zwei Karten nebeneinander - daher weniger Innenabstand
          und kleinere Zahl; ab sm wie bisher */}
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-3 pb-2 sm:items-center sm:p-6 sm:pb-2">
        <div className="flex min-w-0 items-start gap-1.5 sm:items-center sm:gap-2">
          {Icon && (
            <Icon
              aria-hidden="true"
              data-testid={kpiKey ? `kpi-icon-${kpiKey}` : undefined}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground sm:mt-0 sm:h-4 sm:w-4"
            />
          )}
          <CardTitle className="min-w-0 break-words text-sm font-medium">
            {href ? (
              <Link
                to={href}
                data-kpi-link=""
                data-testid={kpiKey ? `kpi-card-link-${kpiKey}` : undefined}
                className="after:absolute after:inset-0 after:rounded-lg focus:outline-none"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </CardTitle>
        </div>
        {explanation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={title}
                  data-testid="kpi-info"
                  className="relative z-10 shrink-0 text-muted-foreground hover:text-foreground transition-colors touch:-m-3 touch:p-3"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{explanation}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        <div className="break-words text-lg font-bold sm:text-2xl">{displayValue}</div>
        <Sparkline
          points={trend}
          interactive={!isTouch}
          formatValue={format}
          onClick={href ? () => navigate(href) : undefined}
          className="mt-1"
          data-testid={kpiKey ? `kpi-sparkline-${kpiKey}` : undefined}
        />
        {subtitle && subtitle.split('\n').map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-1">{line}</p>
        ))}
        {/* Bedienelemente im Inhalt ueber die Klickflaeche der Karte heben */}
        {children && (
          <div className="[&_:is(a,button,input,select)]:relative [&_:is(a,button,input,select)]:z-10">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

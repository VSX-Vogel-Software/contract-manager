import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

// Abstand der Linie zum Rand (px) - Strichstaerke und Punkt sollen nicht abgeschnitten werden
const MARGIN = { top: 2, right: 1, bottom: 1, left: 1 }
// Bis zur ersten Messung (und in jsdom ohne ResizeObserver)
const INITIAL_SIZE = { width: 120, height: 28 }
// Tailwind blue-500 / blue-600 / blue-300
const STROKE = '#3b82f6'
const DOT = '#2563eb'
const CURSOR = '#93c5fd'
// Abstand Tooltip <-> Mauszeiger
const TOOLTIP_OFFSET = 8

/** Breite und Hoehe des Elements, aktualisiert bei Groessenaenderung */
function useElementSize<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(INITIAL_SIZE)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
      }
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])
  return [ref, size] as const
}

/**
 * Kleiner Verlauf ohne Achsen und Animation - nur die Form der Kurve, auf
 * Wunsch mit Tooltip (Monat + Wert). Fuer Screenreader dekorativ
 * (aria-hidden): der aktuelle Wert steht als Zahl daneben.
 *
 * Bewusst als eigenes SVG statt recharts: die Linie steht auf dem Dashboard,
 * recharts kostet dort ~100 KB gz im Startpfad.
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
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>(
    (points?.length ?? 0) >= SPARKLINE_MIN_POINTS
  )
  const [hover, setHover] = useState<{ index: number; y: number } | null>(null)

  if (!points || points.length < SPARKLINE_MIN_POINTS) return null

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Flache Reihe: etwas Luft, sonst liegt die Linie auf der Unterkante
  const pad = max === min ? Math.max(Math.abs(max) * 0.1, 1) : 0
  const lo = min - pad
  const hi = max + pad

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 1)
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 1)
  const bottom = MARGIN.top + innerHeight
  const step = innerWidth / (points.length - 1)
  const coords = points.map((p, i) => ({
    x: MARGIN.left + i * step,
    y: MARGIN.top + (1 - (p.value - lo) / (hi - lo)) * innerHeight,
  }))
  const linePoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]
  const areaPath = `M${first.x.toFixed(2)},${bottom.toFixed(2)} L${linePoints.replace(/ /g, ' L')} L${last.x.toFixed(2)},${bottom.toFixed(2)} Z`

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const index = Math.min(points.length - 1, Math.max(0, Math.round((x - MARGIN.left) / step)))
    const y = event.clientY - rect.top
    setHover((prev) => (prev?.index === index && prev.y === y ? prev : { index, y }))
  }

  const active = interactive && hover ? hover : null
  const activePoint = active ? points[active.index] : null
  const activeCoord = active ? coords[active.index] : null
  // In der rechten Haelfte klappt der Tooltip nach links um, damit er im
  // Diagramm bleibt (nicht aus Kachel oder Bildschirm laeuft)
  const flip = activeCoord ? activeCoord.x > width / 2 : false

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid={testId}
      // interaktiv: ueber die Klickflaeche der Kachel heben, sonst kommt kein Hover an
      className={cn('h-7 w-full sm:h-9', interactive && 'relative z-10', interactive && onClick && 'cursor-pointer', className)}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseLeave={interactive ? () => setHover(null) : undefined}
      onClick={interactive ? onClick : undefined}
    >
      <svg width={width} height={height} className="block overflow-visible" data-sparkline-svg>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={STROKE} stopOpacity={0.2} />
            <stop offset="100%" stopColor={STROKE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path className="sparkline-area" d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        {activeCoord && (
          <line
            className="sparkline-cursor"
            x1={activeCoord.x}
            x2={activeCoord.x}
            y1={MARGIN.top}
            y2={bottom}
            stroke={CURSOR}
            strokeWidth={1}
          />
        )}
        <polyline
          className="sparkline-line"
          points={linePoints}
          fill="none"
          stroke={STROKE}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {activeCoord && <circle className="sparkline-dot" cx={activeCoord.x} cy={activeCoord.y} r={3} fill={DOT} />}
      </svg>
      {active && activePoint && activeCoord && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{
            top: active.y + TOOLTIP_OFFSET,
            ...(flip
              ? { right: width - activeCoord.x + TOOLTIP_OFFSET }
              : { left: activeCoord.x + TOOLTIP_OFFSET }),
          }}
          data-testid="sparkline-tooltip"
        >
          <div className="text-muted-foreground">{formatSparklineMonth(activePoint.month, i18n?.language || 'de')}</div>
          <div className="font-medium tabular-nums">{formatValue(activePoint.value)}</div>
        </div>
      )}
    </div>
  )
}

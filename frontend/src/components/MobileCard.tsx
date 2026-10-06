import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface MobileCardProps {
  /** Ziel beim Antippen der Karte */
  to?: string
  onClick?: () => void
  /** Bei aufklappbaren Karten (onClick): aktueller Zustand fuer Screenreader */
  expanded?: boolean
  title: ReactNode
  /** Rechts neben dem Titel, z. B. Status-Badge */
  badge?: ReactNode
  subtitle?: ReactNode
  /** Linke Fusszeile, z. B. Datum oder Nummer */
  meta?: ReactNode
  /** Rechte Fusszeile, z. B. Betrag */
  amount?: ReactNode
  /** Zusaetzliche Zeile unter dem Fuss (Knoepfe, Checkbox ...). Klicks darin
   * loesen die Karte nicht aus. */
  actions?: ReactNode
  /** Vorangestelltes Element (Checkbox, Icon) */
  leading?: ReactNode
  className?: string
  'data-testid'?: string
}

/**
 * Karte fuer Listen auf schmalen Bildschirmen. Gegenstueck zur Tabellenzeile:
 * Listen rendern unterhalb von `md` diese Karten (`md:hidden`) und darueber die
 * Tabelle (`hidden md:block`).
 */
export function MobileCard({
  to,
  onClick,
  expanded,
  title,
  badge,
  subtitle,
  meta,
  amount,
  actions,
  leading,
  className,
  'data-testid': testId,
}: MobileCardProps) {
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-words font-medium text-gray-900">{title}</div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {subtitle && <div className="min-w-0 break-words text-sm text-gray-600">{subtitle}</div>}
      {(meta || amount) && (
        <div className="flex items-end justify-between gap-2 text-sm">
          <div className="min-w-0 text-xs text-gray-500">{meta}</div>
          {amount && <div className="shrink-0 font-medium tabular-nums text-gray-900">{amount}</div>}
        </div>
      )}
    </div>
  )

  const interactive = 'block active:bg-gray-50'

  return (
    <div
      className={cn('rounded-lg border bg-white p-3 shadow-sm', className)}
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        {leading && <div className="shrink-0 pt-0.5">{leading}</div>}
        {to ? (
          <Link to={to} className={cn('min-w-0 flex-1', interactive)}>
            {body}
          </Link>
        ) : onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            className={cn('min-w-0 flex-1 text-left', interactive)}
          >
            {body}
          </button>
        ) : (
          body
        )}
      </div>
      {actions && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}

/** Container fuer MobileCard-Listen: nur unterhalb von `md` sichtbar. */
export function MobileCardList({ children, className, ...rest }: { children: ReactNode; className?: string; 'data-testid'?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 md:hidden', className)} {...rest}>
      {children}
    </div>
  )
}

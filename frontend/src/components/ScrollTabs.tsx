import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScrollTabsProps {
  children: ReactNode
  className?: string
  /** Wechselt mit dem aktiven Tab; loest das Hineinrollen aus. */
  activeKey?: string | number | null
  'aria-label'?: string
  'data-testid'?: string
}

/**
 * Waagerecht scrollbare Tab-Leiste fuer selbst gebaute Tabs (`<nav>` mit
 * Knoepfen). Auf schmalen Bildschirmen laufen die Tabs nicht aus dem Bild,
 * sondern scrollen; der aktive Tab - markiert mit `aria-current`,
 * `aria-selected="true"` oder `data-active="true"` - wird ins Bild gerollt.
 */
export function ScrollTabs({ children, className, activeKey, ...rest }: ScrollTabsProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>(
      '[aria-current="page"], [aria-current="true"], [aria-selected="true"], [data-active="true"]'
    )
    if (!active) return
    const navRect = nav.getBoundingClientRect()
    const r = active.getBoundingClientRect()
    if (r.left < navRect.left || r.right > navRect.right) {
      nav.scrollTo({
        left: nav.scrollLeft + r.left - navRect.left - (navRect.width - r.width) / 2,
        behavior: 'smooth',
      })
    }
  }, [activeKey])

  return (
    <nav
      ref={ref}
      className={cn('flex max-w-full overflow-x-auto overflow-y-hidden scrollbar-none [&>*]:shrink-0', className)}
      {...rest}
    >
      {children}
    </nav>
  )
}

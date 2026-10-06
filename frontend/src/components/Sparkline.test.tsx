import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sparkline, formatSparklineMonth } from './Sparkline'

const pts = (values: number[]) => values.map((value, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, value }))

describe('Sparkline', () => {
  it('rendert unter 3 Punkten nichts', () => {
    const { container } = render(<Sparkline points={pts([1, 2])} data-testid="spark" />)
    expect(screen.queryByTestId('spark')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('rendert ohne Daten nichts', () => {
    render(<Sparkline points={undefined} data-testid="spark" />)
    render(<Sparkline points={[]} data-testid="spark" />)
    expect(screen.queryByTestId('spark')).toBeNull()
  })

  it('zeichnet ab 3 Punkten eine Flaeche, fuer Screenreader verborgen', () => {
    const { container } = render(<Sparkline points={pts([1, 3, 2])} data-testid="spark" />)
    const el = screen.getByTestId('spark')
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveClass('h-7', 'sm:h-9')
    expect(container.querySelector('.recharts-area')).not.toBeNull()
    // ohne Achsen und Tooltip
    expect(container.querySelector('.recharts-cartesian-axis')).toBeNull()
    expect(container.querySelector('.recharts-tooltip-wrapper')).toBeNull()
  })

  it('kommt mit einer flachen Reihe zurecht', () => {
    const { container } = render(<Sparkline points={pts([5, 5, 5, 5])} data-testid="spark" />)
    expect(screen.getByTestId('spark')).toBeInTheDocument()
    expect(container.querySelector('.recharts-area-curve')?.getAttribute('d') ?? '').not.toContain('NaN')
  })

  it('beschriftet Monate in der Sprache der Oberflaeche', () => {
    expect(formatSparklineMonth('2026-09', 'de')).toMatch(/Sept?\.? 2026/)
    expect(formatSparklineMonth('2026-09', 'en')).toBe('Sep 2026')
    expect(formatSparklineMonth('kaputt', 'de')).toBe('kaputt')
  })
})

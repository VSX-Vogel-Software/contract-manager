import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.querySelector('.sparkline-area')).not.toBeNull()
    expect(container.querySelector('.sparkline-line')).not.toBeNull()
    // ohne Achsen und Tooltip
    expect(container.querySelector('text')).toBeNull()
    expect(screen.queryByTestId('sparkline-tooltip')).toBeNull()
  })

  it('kommt mit einer flachen Reihe zurecht', () => {
    const { container } = render(<Sparkline points={pts([5, 5, 5, 5])} data-testid="spark" />)
    expect(screen.getByTestId('spark')).toBeInTheDocument()
    expect(container.querySelector('.sparkline-line')?.getAttribute('points') ?? '').not.toContain('NaN')
    expect(container.querySelector('.sparkline-area')?.getAttribute('d') ?? '').not.toContain('NaN')
  })

  it('zeigt interaktiv beim Ueberfahren Monat und Wert, klappt rechts um', () => {
    const onClick = vi.fn()
    render(
      <Sparkline points={pts([1, 3, 2, 4])} interactive formatValue={(v) => `${v} EUR`} onClick={onClick} data-testid="spark" />
    )
    const el = screen.getByTestId('spark')
    // jsdom misst nichts: Startgroesse 120 px breit
    fireEvent.mouseMove(el, { clientX: 2, clientY: 10 })
    const tip = screen.getByTestId('sparkline-tooltip')
    expect(tip).toHaveTextContent('1 EUR')
    expect(tip).toHaveTextContent('2026')
    expect(tip.style.left).not.toBe('')
    fireEvent.mouseMove(el, { clientX: 118, clientY: 10 })
    expect(screen.getByTestId('sparkline-tooltip')).toHaveTextContent('4 EUR')
    expect(screen.getByTestId('sparkline-tooltip').style.right).not.toBe('')
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.mouseLeave(el)
    expect(screen.queryByTestId('sparkline-tooltip')).toBeNull()
  })

  it('zeigt ohne interactive keinen Tooltip', () => {
    render(<Sparkline points={pts([1, 3, 2])} data-testid="spark" />)
    fireEvent.mouseMove(screen.getByTestId('spark'), { clientX: 2, clientY: 10 })
    expect(screen.queryByTestId('sparkline-tooltip')).toBeNull()
  })

  it('beschriftet Monate in der Sprache der Oberflaeche', () => {
    expect(formatSparklineMonth('2026-09', 'de')).toMatch(/Sept?\.? 2026/)
    expect(formatSparklineMonth('2026-09', 'en')).toBe('Sep 2026')
    expect(formatSparklineMonth('kaputt', 'de')).toBe('kaputt')
  })
})
